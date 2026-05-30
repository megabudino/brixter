import { error, fail, redirect, type Actions, type RequestEvent } from '@sveltejs/kit';
import { getDb } from '../server/db.ts';
import { getOctokit, getRepo } from '../server/github.ts';
import { getRepoConfig, updateRepoConfig } from '../server/repo-config.ts';
import { marked } from 'marked';

type DashboardPage = 'branches' | 'login' | 'setup' | 'new-branch' | 'settings' | 'branch';

interface PageMatch {
	page: DashboardPage;
	branch?: string;
	path?: string;
}

const editorRenderer = {
	html({ text }: { text: string }) {
		const trimmed = text.trim();
		if (!trimmed) return text;
		return `<div data-html-block>${trimmed}</div>`;
	}
};

function decodePathPart(value: string | undefined): string {
	return decodeURIComponent(value ?? '');
}

function dashboardPath(pathname: string): string {
	if (pathname === '/admin') return '';
	if (pathname.startsWith('/admin/')) return pathname.slice('/admin/'.length);
	if (pathname === '/__brixter') return '';
	if (pathname.startsWith('/__brixter/')) return pathname.slice('/__brixter/'.length);
	return '';
}

function matchPage(pathname: string): PageMatch {
	const path = dashboardPath(pathname).replace(/\/$/, '');
	if (!path) return { page: 'branches' };
	if (path === 'login') return { page: 'login' };
	if (path === 'setup') return { page: 'setup' };
	if (path === 'settings') return { page: 'settings' };
	if (path === 'b/new') return { page: 'new-branch' };

	const parts = path.split('/');
	if (parts[0] === 'b' && parts[1]) {
		return {
			page: 'branch',
			branch: decodePathPart(parts[1]),
			path: decodePathPart(parts.slice(2).join('/'))
		};
	}

	throw error(404, 'Not found');
}

async function loadBranches({ locals }: RequestEvent) {
	if (!locals.user) throw redirect(302, '/admin/login');

	const octokit = getOctokit();
	const repo = getRepo();
	const branchNames: string[] = [];
	let page = 1;

	while (true) {
		const { data } = await octokit.request('GET /repos/{owner}/{repo}/branches', {
			owner: repo.owner,
			repo: repo.name,
			per_page: 100,
			page
		});

		for (const branch of data) branchNames.push(branch.name);
		if (data.length < 100) break;
		page++;
	}

	const branches = await Promise.all(
		branchNames.map(async (name) => {
			if (name === repo.defaultBranch) return { name, isDefault: true, behindBy: 0 };

			try {
				const { data: comparison } = await octokit.request(
					'GET /repos/{owner}/{repo}/compare/{basehead}',
					{
						owner: repo.owner,
						repo: repo.name,
						basehead: `${name}...${repo.defaultBranch}`
					}
				);
				return { name, isDefault: false, behindBy: comparison.ahead_by };
			} catch {
				return { name, isDefault: false, behindBy: 0 };
			}
		})
	);

	branches.sort((a, b) => {
		if (a.isDefault) return -1;
		if (b.isDefault) return 1;
		return a.name.localeCompare(b.name);
	});

	return {
		repo: { name: repo.name, fullName: repo.fullName, defaultBranch: repo.defaultBranch },
		branches
	};
}

async function loadLogin({ locals }: RequestEvent) {
	if (locals.user) throw redirect(302, '/admin');
	return {};
}

async function loadNewBranch({ locals }: RequestEvent) {
	if (!locals.user) throw redirect(302, '/admin/login');
	const repo = getRepo();
	return { repo: { name: repo.name, defaultBranch: repo.defaultBranch } };
}

async function fetchDirectoryTree(branch: string): Promise<string[]> {
	const octokit = getOctokit();
	const repo = getRepo();

	const { data: ref } = await octokit.request('GET /repos/{owner}/{repo}/git/ref/{ref}', {
		owner: repo.owner,
		repo: repo.name,
		ref: `heads/${branch}`
	});

	const { data: commit } = await octokit.request(
		'GET /repos/{owner}/{repo}/git/commits/{commit_sha}',
		{
			owner: repo.owner,
			repo: repo.name,
			commit_sha: ref.object.sha
		}
	);

	const { data: tree } = await octokit.request('GET /repos/{owner}/{repo}/git/trees/{tree_sha}', {
		owner: repo.owner,
		repo: repo.name,
		tree_sha: commit.tree.sha,
		recursive: '1'
	});

	return tree.tree
		.filter((item: { type?: string }) => item.type === 'tree')
		.map((item: { path?: string }) => item.path as string)
		.sort();
}

async function loadSettings({ locals }: RequestEvent) {
	if (!locals.user) throw redirect(302, '/admin/login');
	if (locals.user.role !== 'admin') throw error(403, 'Only admins can access settings');

	const config = getRepoConfig();
	const repo = getRepo();
	const directories = await fetchDirectoryTree(repo.defaultBranch);

	return {
		repo: { name: repo.name, fullName: repo.fullName },
		config,
		directories
	};
}

async function loadBranch({ locals }: RequestEvent, match: PageMatch) {
	if (!locals.user) throw redirect(302, '/admin/login');
	if (!match.branch) throw error(404, 'Not found');

	const config = getRepoConfig();
	const { allowedPaths, allowedExtensions, mediaPath } = config;
	const octokit = getOctokit();
	const repo = getRepo();
	const defaultBranch = repo.defaultBranch;
	const branchBase = `/admin/b/${match.branch}`;
	const filePath = match.path ?? '';

	let behindBy = 0;
	if (match.branch !== defaultBranch) {
		try {
			const { data: comparison } = await octokit.request(
				'GET /repos/{owner}/{repo}/compare/{basehead}',
				{
					owner: repo.owner,
					repo: repo.name,
					basehead: `${match.branch}...${defaultBranch}`
				}
			);
			behindBy = comparison.ahead_by;
		} catch {
			// Treat compare failures as up to date.
		}
	}

	if (allowedPaths.length > 0 && filePath) {
		const isAllowedOrParent = allowedPaths.some(
			(ap) => ap === filePath || ap.startsWith(filePath + '/')
		);
		const isChildOfAllowed = allowedPaths.some((ap) => filePath.startsWith(ap + '/'));
		if (!isAllowedOrParent && !isChildOfAllowed) throw error(403, 'Access denied');
	}

	if (!filePath && allowedPaths.length > 0) {
		const entries = allowedPaths
			.map((ap) => ({ name: ap.split('/').pop()!, type: 'dir' as const, path: ap }))
			.sort((a, b) => a.name.localeCompare(b.name));

		return {
			repo: { name: repo.name, fullName: repo.fullName, mediaPath },
			branch: match.branch,
			defaultBranch,
			filePath,
			entries,
			allowedPaths,
			behindBy
		};
	}

	try {
		const { data } = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
			owner: repo.owner,
			repo: repo.name,
			path: filePath,
			ref: match.branch
		});

		if (!Array.isArray(data)) {
			const file = data as {
				name: string;
				path: string;
				sha: string;
				download_url: string;
				size: number;
				content?: string;
				encoding?: string;
			};

			let htmlContent: string | undefined;
			let frontmatter: string | undefined;

			if (file.name.endsWith('.md') && file.content && file.encoding === 'base64') {
				const raw = Buffer.from(file.content, 'base64').toString('utf-8');
				const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);

				if (fmMatch) {
					frontmatter = fmMatch[1];
					htmlContent = await marked.use({ renderer: editorRenderer }).parse(fmMatch[2]);
				} else {
					htmlContent = await marked.use({ renderer: editorRenderer }).parse(raw);
				}

				const mediaPrefix = (mediaPath ?? '').replace(/\/$/, '');
				htmlContent = htmlContent.replace(/src="\/([^"]+)"/g, (_match, imgPath) => {
					const repoPath = mediaPrefix ? `${mediaPrefix}/${imgPath}` : imgPath;
					const proxyParams = new URLSearchParams({ branch: match.branch!, path: repoPath });
					return `src="/admin/api/repo-image?${proxyParams}"`;
				});
			}

			return {
				repo: { name: repo.name, fullName: repo.fullName, mediaPath },
				branch: match.branch,
				defaultBranch,
				filePath,
				file: {
					name: file.name,
					path: file.path,
					sha: file.sha,
					downloadUrl: file.download_url,
					size: file.size,
					htmlContent,
					frontmatter
				},
				entries: [],
				allowedPaths,
				behindBy
			};
		}

		const entries = data
			.map((item) => ({
				name: item.name,
				type: item.type as 'file' | 'dir',
				path: item.path,
				downloadUrl: item.download_url as string | null
			}))
			.filter((item: { name: string; type: string; path: string }) => {
				if (allowedPaths.length === 0) {
					return item.type === 'dir' || allowedExtensions.includes('.' + item.name.split('.').pop());
				}

				const isInsideAllowed = allowedPaths.some((ap) => item.path.startsWith(ap + '/'));
				if (isInsideAllowed) {
					if (item.type === 'dir') return true;
					const ext = '.' + item.name.split('.').pop();
					return allowedExtensions.includes(ext);
				}

				if (item.type === 'dir') {
					return allowedPaths.some((ap) => ap === item.path || ap.startsWith(item.path + '/'));
				}

				return false;
			})
			.sort((a, b) => {
				if (a.type === b.type) return a.name.localeCompare(b.name);
				return a.type === 'dir' ? -1 : 1;
			});

		const dirs = entries.filter((e) => e.type === 'dir');
		const files = entries.filter((e) => e.type === 'file');
		if (dirs.length === 1 && files.length === 0) throw redirect(302, `${branchBase}/${dirs[0].path}`);

		return {
			repo: { name: repo.name, fullName: repo.fullName, mediaPath },
			branch: match.branch,
			defaultBranch,
			filePath,
			entries,
			allowedPaths,
			behindBy
		};
	} catch (err: unknown) {
		const e = err as { status?: number; response?: { status?: number; data?: { message?: string } } };
		if (e.status) throw err;
		throw error(e.response?.status ?? 500, e.response?.data?.message ?? 'Failed to load contents');
	}
}

export async function loadDashboard(event: RequestEvent) {
	if (event.url.pathname.startsWith('/__brixter')) throw error(404, 'Not found');

	const match = matchPage(event.url.pathname);
	const isPublic = match.page === 'login' || match.page === 'setup';

	if (!isPublic && !event.locals.user) throw redirect(302, '/admin/login');

	let pageData: Record<string, unknown>;
	switch (match.page) {
		case 'branches':
			pageData = await loadBranches(event);
			break;
		case 'login':
			pageData = await loadLogin(event);
			break;
		case 'setup':
			pageData = {};
			break;
		case 'new-branch':
			pageData = await loadNewBranch(event);
			break;
		case 'settings':
			pageData = await loadSettings(event);
			break;
		case 'branch':
			pageData = await loadBranch(event, match);
			break;
	}

	return {
		page: match.page,
		isAdmin: event.locals.user?.role === 'admin',
		pageData
	};
}

async function loginAction({ request }: RequestEvent) {
	const formData = await request.formData();
	const email = formData.get('email')?.toString().trim() ?? '';
	const password = formData.get('password')?.toString() ?? '';

	if (!email || !password) return fail(400, { message: 'Email and password are required.', email });

	try {
		const { getAuth } = await import('../server/auth.ts');
		await getAuth().api.signInEmail({ body: { email, password } });
	} catch {
		return fail(400, { message: 'Invalid email or password.', email });
	}

	throw redirect(302, '/admin');
}

async function setupAction({ request }: RequestEvent) {
	const formData = await request.formData();
	const name = formData.get('name')?.toString().trim() ?? '';
	const email = formData.get('email')?.toString().trim() ?? '';
	const password = formData.get('password')?.toString() ?? '';
	const confirmPassword = formData.get('confirmPassword')?.toString() ?? '';

	if (!name || !email || !password) return fail(400, { message: 'All fields are required.', name, email });
	if (password.length < 8) {
		return fail(400, { message: 'Password must be at least 8 characters.', name, email });
	}
	if (password !== confirmPassword) return fail(400, { message: 'Passwords do not match.', name, email });

	try {
		const { getAuth } = await import('../server/auth.ts');
		const auth = getAuth();
		const user = await auth.api.signUpEmail({ body: { email, password, name } });
		getDb().prepare('UPDATE "user" SET role = ? WHERE id = ?').run('admin', user.user.id);
		await auth.api.signInEmail({ body: { email, password } });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Account creation failed.';
		return fail(400, { message, name, email });
	}

	throw redirect(302, '/admin');
}

async function newBranchAction({ request, locals }: RequestEvent) {
	if (!locals.user) throw redirect(302, '/admin/login');

	const formData = await request.formData();
	const branchName = formData.get('branch_name')?.toString().trim() ?? '';
	if (!branchName) return fail(400, { message: 'Branch name is required.', branchName });

	const octokit = getOctokit();
	const repo = getRepo();

	try {
		const { data: ref } = await octokit.request('GET /repos/{owner}/{repo}/git/ref/{ref}', {
			owner: repo.owner,
			repo: repo.name,
			ref: `heads/${repo.defaultBranch}`
		});

		await octokit.request('POST /repos/{owner}/{repo}/git/refs', {
			owner: repo.owner,
			repo: repo.name,
			ref: `refs/heads/${branchName}`,
			sha: ref.object.sha
		});
	} catch (err: unknown) {
		const message =
			(err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
			'Failed to create branch.';
		return fail(400, { message, branchName });
	}

	throw redirect(302, '/admin');
}

async function settingsAction({ request, locals }: RequestEvent) {
	if (!locals.user) throw redirect(302, '/admin/login');
	if (locals.user.role !== 'admin') throw error(403, 'Only admins can access settings');

	const formData = await request.formData();
	const extensionsRaw = formData.get('extensions')?.toString().trim() ?? '';
	const selectedPaths = formData.getAll('allowed_paths').map((p) => p.toString());
	const mediaPath = formData.get('media_path')?.toString().trim() ?? '';
	const extensions = extensionsRaw
		.split(',')
		.map((e) => e.trim())
		.filter((e) => e.startsWith('.'));

	if (extensions.length === 0) {
		return fail(400, { message: 'At least one valid extension is required (e.g. .md).' });
	}

	updateRepoConfig({ allowedPaths: selectedPaths, allowedExtensions: extensions, mediaPath });
	return { success: true };
}

async function mergeAction({ locals, url }: RequestEvent) {
	if (!locals.user) throw redirect(302, '/admin/login');
	if (locals.user.role !== 'admin') return fail(403, { mergeError: 'Only admins can merge.' });

	const match = matchPage(url.pathname);
	if (match.page !== 'branch' || !match.branch) return fail(404, { mergeError: 'Not found.' });

	const octokit = getOctokit();
	const repo = getRepo();

	try {
		await octokit.request('POST /repos/{owner}/{repo}/merges', {
			owner: repo.owner,
			repo: repo.name,
			base: match.branch,
			head: repo.defaultBranch
		});
	} catch (err: unknown) {
		const e = err as { response?: { status?: number; data?: { message?: string } } };
		return fail(e.response?.status ?? 500, { mergeError: e.response?.data?.message ?? 'Merge failed' });
	}

	return { mergeSuccess: true };
}

async function saveAction({ request, locals, url }: RequestEvent) {
	if (!locals.user) throw redirect(302, '/admin/login');

	const match = matchPage(url.pathname);
	if (match.page !== 'branch' || !match.branch) return fail(404, { saveError: 'Not found.' });

	const formData = await request.formData();
	const markdown = formData.get('markdown')?.toString() ?? '';
	const frontmatterYaml = formData.get('frontmatter')?.toString() ?? '';
	const sha = formData.get('sha')?.toString() ?? '';
	const filePath = match.path ?? '';

	if (!filePath || !sha) return fail(400, { saveError: 'Missing file path or sha.' });

	const fileContent = frontmatterYaml.trim()
		? `---\n${frontmatterYaml.trim()}\n---\n${markdown}`
		: markdown;
	const octokit = getOctokit();
	const repo = getRepo();

	try {
		await octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', {
			owner: repo.owner,
			repo: repo.name,
			path: filePath,
			message: `Update ${filePath}`,
			content: Buffer.from(fileContent).toString('base64'),
			sha,
			branch: match.branch
		});
	} catch (err: unknown) {
		const e = err as { response?: { status?: number; data?: { message?: string } } };
		return fail(e.response?.status ?? 500, { saveError: e.response?.data?.message ?? 'Save failed' });
	}

	return { saveSuccess: true };
}

export const dashboardActions: Actions = {
	default: async (event) => {
		if (event.url.pathname.startsWith('/__brixter')) throw error(404, 'Not found');
		const match = matchPage(event.url.pathname);
		switch (match.page) {
			case 'login':
				return loginAction(event);
			case 'setup':
				return setupAction(event);
			case 'new-branch':
				return newBranchAction(event);
			case 'settings':
				return settingsAction(event);
			default:
				throw error(405, 'Method not allowed');
		}
	},
	merge: async (event) => {
		if (event.url.pathname.startsWith('/__brixter')) throw error(404, 'Not found');
		return mergeAction(event);
	},
	save: async (event) => {
		if (event.url.pathname.startsWith('/__brixter')) throw error(404, 'Not found');
		return saveAction(event);
	}
};
