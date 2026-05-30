import { error, fail, redirect, type Actions, type RequestEvent } from '@sveltejs/kit';
import { getAuth } from '../server/auth.ts';
import { getConfig } from '../server/config.ts';
import { getDb } from '../server/db.ts';
import { getOctokit, getRepo } from '../server/github.ts';
import { getRepoConfig, updateRepoConfig } from '../server/repo-config.ts';
import {
	buildRouteListing,
	isPageFilePath,
	isWithinRepoRoot,
	normalizeRepoPath,
	routeBreadcrumbs,
	type TreeEntry
} from '../server/sveltekit-routes.ts';
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

async function loadSettings({ locals }: RequestEvent) {
	if (!locals.user) throw redirect(302, '/admin/login');
	if (locals.user.role !== 'admin') throw error(403, 'Only admins can access settings');

	const config = getRepoConfig();
	const coreConfig = getConfig();
	const repo = getRepo();

	return {
		repo: { name: repo.name, fullName: repo.fullName },
		config,
		routesRoot: coreConfig.routesRoot
	};
}

function parentPathFor(path: string, routesRoot: string): string | null {
	if (path === routesRoot) return null;
	const parent = path.split('/').slice(0, -1).join('/');
	return parent && isWithinRepoRoot(parent, routesRoot) ? parent : null;
}

function validateDirectoryName(name: string): string | null {
	if (!name) return 'Directory name is required.';
	if (name === '.' || name === '..') return 'Directory name is reserved.';
	if (name.includes('/') || name.includes('\\')) return 'Directory name cannot contain slashes.';
	if (name.startsWith('+')) return 'Directory name cannot start with "+".';
	return null;
}

function branchHref(branch: string, path = ''): string {
	const base = `/admin/b/${encodeURIComponent(branch)}`;
	if (!path) return base;
	return `${base}/${path.split('/').map(encodeURIComponent).join('/')}`;
}

async function fetchRepoTree(branch: string): Promise<TreeEntry[]> {
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
		.filter((item: { type?: string }) => item.type === 'tree' || item.type === 'blob')
		.map((item: { path?: string; type?: string }) => ({
			path: item.path as string,
			type: item.type as 'tree' | 'blob'
		}));
}

async function loadBranchFile(
	branch: string,
	filePath: string,
	mediaPath: string
): Promise<Record<string, unknown>> {
	const octokit = getOctokit();
	const repo = getRepo();

	const { data } = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
		owner: repo.owner,
		repo: repo.name,
		path: filePath,
		ref: branch
	});

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
			const proxyParams = new URLSearchParams({ branch, path: repoPath });
			return `src="/admin/api/repo-image?${proxyParams}"`;
		});
	}

	return {
		file: {
			name: file.name,
			path: file.path,
			sha: file.sha,
			downloadUrl: file.download_url,
			size: file.size,
			htmlContent,
			frontmatter
		}
	};
}

async function loadBranch({ locals }: RequestEvent, match: PageMatch) {
	if (!locals.user) throw redirect(302, '/admin/login');
	if (!match.branch) throw error(404, 'Not found');

	const { mediaPath } = getRepoConfig();
	const routesRoot = normalizeRepoPath(getConfig().routesRoot);
	const octokit = getOctokit();
	const repo = getRepo();
	const defaultBranch = repo.defaultBranch;
	const requestedPath = normalizeRepoPath(match.path);
	const filePath = requestedPath || routesRoot;

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

	if (!isWithinRepoRoot(filePath, routesRoot)) throw error(403, 'Access denied');

	let tree: TreeEntry[];
	try {
		tree = await fetchRepoTree(match.branch);
	} catch (err: unknown) {
		const e = err as {
			status?: number;
			response?: { status?: number; data?: { message?: string } };
		};
		if (e.status) throw err;
		throw error(e.response?.status ?? 500, e.response?.data?.message ?? 'Failed to load contents');
	}

	const node = tree.find((entry) => entry.path === filePath);
	const isFile = node?.type === 'blob' || (!node && isPageFilePath(filePath));

	const repoMeta = { name: repo.name, fullName: repo.fullName, mediaPath, routesRoot };

	if (isFile) {
		let filePayload: Record<string, unknown>;
		try {
			filePayload = await loadBranchFile(match.branch, filePath, mediaPath);
		} catch (err: unknown) {
			const e = err as {
				status?: number;
				response?: { status?: number; data?: { message?: string } };
			};
			if (e.status) throw err;
			throw error(
				e.response?.status ?? 500,
				e.response?.data?.message ?? 'Failed to load contents'
			);
		}

		const file = filePayload.file as { path: string };
		return {
			repo: repoMeta,
			branch: match.branch,
			defaultBranch,
			filePath,
			explorerRoot: routesRoot,
			parentPath: parentPathFor(file.path, routesRoot),
			breadcrumbs: routeBreadcrumbs(file.path, routesRoot),
			...filePayload,
			entries: [],
			childDirNames: [],
			behindBy
		};
	}

	const { ownPage, entries: routeEntries, childDirNames } = buildRouteListing(tree, filePath);
	const entries = ownPage ? [ownPage, ...routeEntries] : routeEntries;

	return {
		repo: repoMeta,
		branch: match.branch,
		defaultBranch,
		filePath,
		explorerRoot: routesRoot,
		parentPath: requestedPath ? parentPathFor(filePath, routesRoot) : null,
		breadcrumbs: routeBreadcrumbs(filePath, routesRoot),
		entries,
		childDirNames,
		behindBy
	};
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

function applySetCookieHeaders(headers: Headers, cookies: RequestEvent['cookies']) {
	const header = headers.get('set-cookie');
	if (!header) return;

	const [pair, ...attributes] = header.split(';').map((part) => part.trim());
	const separator = pair.indexOf('=');
	if (separator === -1) return;

	const name = pair.slice(0, separator);
	const value = pair.slice(separator + 1);
	const options: Parameters<typeof cookies.set>[2] = {
		path: '/',
		encode: (cookieValue) => cookieValue
	};

	for (const attribute of attributes) {
		const [rawKey, rawValue] = attribute.split('=');
		const key = rawKey.toLowerCase();
		if (key === 'httponly') options.httpOnly = true;
		if (key === 'secure') options.secure = true;
		if (key === 'path' && rawValue) options.path = rawValue;
		if (key === 'max-age' && rawValue) options.maxAge = Number(rawValue);
		if (key === 'samesite' && rawValue) {
			options.sameSite = rawValue.toLowerCase() as 'strict' | 'lax' | 'none';
		}
	}

	cookies.set(name, value, options);
}

async function loginAction({ request, cookies }: RequestEvent) {
	const formData = await request.formData();
	const email = formData.get('email')?.toString().trim() ?? '';
	const password = formData.get('password')?.toString() ?? '';

	if (!email || !password) return fail(400, { message: 'Email and password are required.', email });

	try {
		const result = await getAuth().api.signInEmail({
			body: { email, password },
			headers: request.headers,
			returnHeaders: true
		});
		applySetCookieHeaders(result.headers, cookies);
	} catch (err) {
		if (process.env.NODE_ENV !== 'production') {
			console.error('brixter login failed', err);
		}
		return fail(400, { message: 'Invalid email or password.', email });
	}

	throw redirect(302, '/admin');
}

async function setupAction({ request, cookies }: RequestEvent) {
	const formData = await request.formData();
	const name = formData.get('name')?.toString().trim() ?? '';
	const email = formData.get('email')?.toString().trim() ?? '';
	const password = formData.get('password')?.toString() ?? '';
	const confirmPassword = formData.get('confirmPassword')?.toString() ?? '';

	if (!name || !email || !password)
		return fail(400, { message: 'All fields are required.', name, email });
	if (password.length < 8) {
		return fail(400, { message: 'Password must be at least 8 characters.', name, email });
	}
	if (password !== confirmPassword)
		return fail(400, { message: 'Passwords do not match.', name, email });

	try {
		const auth = getAuth();
		const user = await auth.api.signUpEmail({ body: { email, password, name } });
		getDb().prepare('UPDATE "user" SET role = ? WHERE id = ?').run('admin', user.user.id);
		const result = await auth.api.signInEmail({
			body: { email, password },
			headers: request.headers,
			returnHeaders: true
		});
		applySetCookieHeaders(result.headers, cookies);
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
	const mediaPath = formData.get('media_path')?.toString().trim() ?? '';
	const extensions = extensionsRaw
		.split(',')
		.map((e) => e.trim())
		.filter((e) => e.startsWith('.'));

	if (extensions.length === 0) {
		return fail(400, { message: 'At least one valid extension is required (e.g. .md).' });
	}

	updateRepoConfig({ allowedPaths: [], allowedExtensions: extensions, mediaPath });
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
		return fail(e.response?.status ?? 500, {
			mergeError: e.response?.data?.message ?? 'Merge failed'
		});
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
	const filePath = normalizeRepoPath(match.path);
	const routesRoot = normalizeRepoPath(getConfig().routesRoot);

	if (!filePath || !sha) return fail(400, { saveError: 'Missing file path or sha.' });
	if (!isWithinRepoRoot(filePath, routesRoot)) return fail(403, { saveError: 'Access denied.' });

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
		return fail(e.response?.status ?? 500, {
			saveError: e.response?.data?.message ?? 'Save failed'
		});
	}

	return { saveSuccess: true };
}

async function createDirectoryAction({ request, locals, url }: RequestEvent) {
	if (!locals.user) throw redirect(302, '/admin/login');

	const match = matchPage(url.pathname);
	if (match.page !== 'branch' || !match.branch)
		return fail(404, { createDirectoryError: 'Not found.' });

	const formData = await request.formData();
	const name = formData.get('directory_name')?.toString().trim() ?? '';
	const validationError = validateDirectoryName(name);
	if (validationError)
		return fail(400, { createDirectoryError: validationError, directoryName: name });

	const routesRoot = normalizeRepoPath(getConfig().routesRoot);
	const currentPath = normalizeRepoPath(match.path) || routesRoot;
	if (!isWithinRepoRoot(currentPath, routesRoot)) {
		return fail(403, { createDirectoryError: 'Access denied.', directoryName: name });
	}

	const directoryPath = `${currentPath}/${name}`;
	if (!isWithinRepoRoot(directoryPath, routesRoot)) {
		return fail(403, { createDirectoryError: 'Access denied.', directoryName: name });
	}

	const octokit = getOctokit();
	const repo = getRepo();

	try {
		await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
			owner: repo.owner,
			repo: repo.name,
			path: directoryPath,
			ref: match.branch
		});

		return fail(409, {
			createDirectoryError: `Directory "${name}" already exists.`,
			directoryName: name
		});
	} catch (err: unknown) {
		const e = err as { response?: { status?: number; data?: { message?: string } } };
		if (e.response?.status !== 404) {
			return fail(e.response?.status ?? 500, {
				createDirectoryError: e.response?.data?.message ?? 'Failed to check directory.',
				directoryName: name
			});
		}
	}

	try {
		await octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', {
			owner: repo.owner,
			repo: repo.name,
			path: `${directoryPath}/.gitkeep`,
			message: `Create ${directoryPath}`,
			content: Buffer.from('').toString('base64'),
			branch: match.branch
		});
	} catch (err: unknown) {
		const e = err as { response?: { status?: number; data?: { message?: string } } };
		return fail(e.response?.status ?? 500, {
			createDirectoryError: e.response?.data?.message ?? 'Failed to create directory.',
			directoryName: name
		});
	}

	throw redirect(303, branchHref(match.branch, directoryPath));
}

export const dashboardActions: Actions = {
	login: async (event) => {
		if (event.url.pathname.startsWith('/__brixter')) throw error(404, 'Not found');
		const match = matchPage(event.url.pathname);
		if (match.page !== 'login') throw error(405, 'Method not allowed');
		return loginAction(event);
	},
	setup: async (event) => {
		if (event.url.pathname.startsWith('/__brixter')) throw error(404, 'Not found');
		const match = matchPage(event.url.pathname);
		if (match.page !== 'setup') throw error(405, 'Method not allowed');
		return setupAction(event);
	},
	newBranch: async (event) => {
		if (event.url.pathname.startsWith('/__brixter')) throw error(404, 'Not found');
		const match = matchPage(event.url.pathname);
		if (match.page !== 'new-branch') throw error(405, 'Method not allowed');
		return newBranchAction(event);
	},
	settings: async (event) => {
		if (event.url.pathname.startsWith('/__brixter')) throw error(404, 'Not found');
		const match = matchPage(event.url.pathname);
		if (match.page !== 'settings') throw error(405, 'Method not allowed');
		return settingsAction(event);
	},
	merge: async (event) => {
		if (event.url.pathname.startsWith('/__brixter')) throw error(404, 'Not found');
		return mergeAction(event);
	},
	save: async (event) => {
		if (event.url.pathname.startsWith('/__brixter')) throw error(404, 'Not found');
		return saveAction(event);
	},
	createDirectory: async (event) => {
		if (event.url.pathname.startsWith('/__brixter')) throw error(404, 'Not found');
		return createDirectoryAction(event);
	}
};
