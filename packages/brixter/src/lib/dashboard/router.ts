import { error, fail, redirect, type Actions, type RequestEvent } from '@sveltejs/kit';
import { getAuth } from '../server/auth.ts';
import { getConfig, getCoreConfigIssues } from '../server/config.ts';
import { isSetupComplete } from '../server/setup.ts';
import { getDb } from '../server/db.ts';
import { getOctokit, getRepo } from '../server/github.ts';
import {
	childDirNames,
	childPageNames,
	childRoute,
	findRouteNode,
	getExplorerListing,
	isWithinRepoRoot,
	normalizeRepoPath,
	routeDirUrlPath,
	routeBreadcrumbs,
	routePageUrlPath,
	resolveRouteUrlPath,
	type RouteNode,
	type TreeEntry
} from '../server/sveltekit-routes.ts';
import {
	getBranchRouteSnapshot,
	getBranchStatus,
	invalidateBranchRouteCache
} from './repo-cache.ts';
import { marked } from 'marked';
import { resolveLocalPath } from './api.ts';

type DashboardPage =
	| 'login'
	| 'setup'
	| 'config-error'
	| 'accounts'
	| 'branch'
	| 'media'
	| 'publish';

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

const DRAFT_BRANCH = 'brixter-draft';
const LEGACY_DRAFT_BRANCHES = ['drafts'];

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
	if (!path) throw redirect(302, '/admin/routes');
	if (path === 'login') return { page: 'login' };
	if (path === 'setup') return { page: 'setup' };
	if (path === 'config-error') return { page: 'config-error' };
	if (path === 'settings') throw redirect(302, '/admin/routes');
	if (path === 'accounts') return { page: 'accounts' };
	if (path === 'publish') return { page: 'publish', branch: DRAFT_BRANCH };

	const parts = path.split('/');
	if (parts[0] === 'routes') {
		return {
			page: 'branch',
			branch: DRAFT_BRANCH,
			path: decodePathPart(parts.slice(1).join('/'))
		};
	}

	if (parts[0] === 'media') {
		return {
			page: 'media',
			branch: DRAFT_BRANCH,
			path: decodePathPart(parts.slice(1).join('/'))
		};
	}

	if (parts[0] === 'b' && parts[1]) {
		const branch = decodePathPart(parts[1]);
		if (branch !== DRAFT_BRANCH && !LEGACY_DRAFT_BRANCHES.includes(branch)) {
			throw redirect(302, '/admin/routes');
		}
		const routePath = parts
			.slice(2)
			.map((segment) => encodeRouteSegment(decodePathPart(segment)))
			.join('/');
		throw redirect(302, routePath ? `/admin/routes/${routePath}` : '/admin/routes');
	}

	throw error(404, 'Not found');
}

async function loadLogin({ locals }: RequestEvent) {
	if (!isSetupComplete()) throw redirect(302, '/admin/setup');
	if (locals.user) throw redirect(302, '/admin/routes');
	return {};
}

async function loadAccounts({ locals }: RequestEvent) {
	if (!locals.user) throw redirect(302, '/admin/login');

	const users = getDb()
		.prepare('SELECT id, name, email, createdAt FROM "user" ORDER BY createdAt ASC')
		.all() as Array<{
		id: string;
		name: string;
		email: string;
		createdAt: string;
	}>;

	return { users, currentUserId: locals.user.id };
}

function parentPathFor(path: string, routeTree: RouteNode): string | null {
	if (path === routeTree.dirPath) return null;
	const parent = path.split('/').slice(0, -1).join('/');
	return parent && findRouteNode(routeTree, parent)
		? routeDirUrlPath(routeTree.dirPath, parent)
		: null;
}

function parentPathForPage(path: string, routeTree: RouteNode): string | null {
	const routeDir = path.split('/').slice(0, -1).join('/');
	const routeNode = findRouteNode(routeTree, routeDir);
	if (!routeNode) return parentPathFor(path, routeTree);

	// Leaf pages are displayed collapsed in the parent listing, so "back"
	// should return to that mapped parent rather than opening the route dir.
	if (routeNode.children.length === 0) return parentPathFor(routeDir, routeTree);
	return routeDirUrlPath(routeTree.dirPath, routeDir);
}

function validateDirectoryName(name: string): string | null {
	if (!name) return 'Directory name is required.';
	if (name === '.' || name === '..') return 'Directory name is reserved.';
	if (name.includes('/') || name.includes('\\')) return 'Directory name cannot contain slashes.';
	if (name.startsWith('+')) return 'Directory name cannot start with "+".';
	return null;
}

function titleFromRouteName(name: string): string {
	return name
		.split(/[-_\s]+/)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(' ');
}

function isBrixYamlFile(path: string): boolean {
	return /\.brix\.ya?ml$/i.test(path);
}

function encodeRouteSegment(segment: string): string {
	return segment === '+page' ? segment : encodeURIComponent(segment);
}

function routesHref(path = ''): string {
	const base = '/admin/routes';
	if (!path) return base;
	return `${base}/${path.split('/').map(encodeRouteSegment).join('/')}`;
}

function isGithubNotFound(err: unknown): boolean {
	const e = err as { status?: number; response?: { status?: number } };
	return (e.status ?? e.response?.status) === 404;
}

async function getBranchRefSha(branch: string): Promise<string | null> {
	const octokit = getOctokit();
	const repo = getRepo();

	try {
		const { data: ref } = await octokit.request('GET /repos/{owner}/{repo}/git/ref/{ref}', {
			owner: repo.owner,
			repo: repo.name,
			ref: `heads/${branch}`
		});
		return ref.object.sha;
	} catch (err: unknown) {
		if (isGithubNotFound(err)) return null;
		throw err;
	}
}

async function ensureDraftBranch(): Promise<void> {
	const octokit = getOctokit();
	const repo = getRepo();

	if (repo.defaultBranch === DRAFT_BRANCH) return;

	if (await getBranchRefSha(DRAFT_BRANCH)) return;

	let sourceSha: string | null = null;
	for (const legacyBranch of LEGACY_DRAFT_BRANCHES) {
		sourceSha = await getBranchRefSha(legacyBranch);
		if (sourceSha) break;
	}
	sourceSha ??= await getBranchRefSha(repo.defaultBranch);
	if (!sourceSha) throw error(500, 'Failed to resolve draft branch source.');

	try {
		await octokit.request('POST /repos/{owner}/{repo}/git/refs', {
			owner: repo.owner,
			repo: repo.name,
			ref: `refs/heads/${DRAFT_BRANCH}`,
			sha: sourceSha
		});
		invalidateBranchRouteCache(DRAFT_BRANCH);
	} catch (err: unknown) {
		const e = err as { status?: number; response?: { status?: number } };
		const status = e.status ?? e.response?.status;
		if (status !== 422) throw err;
	}
}

async function syncDraftWithDefaultBranch(defaultBranch: string): Promise<{
	behindBy: number;
	aheadBy: number;
	syncError?: string;
}> {
	if (defaultBranch === DRAFT_BRANCH) return { behindBy: 0, aheadBy: 0 };

	const status = await getBranchStatus(DRAFT_BRANCH, defaultBranch);
	if (status.behindBy === 0) return status;

	const octokit = getOctokit();
	const repo = getRepo();

	try {
		await octokit.request('POST /repos/{owner}/{repo}/merges', {
			owner: repo.owner,
			repo: repo.name,
			base: DRAFT_BRANCH,
			head: defaultBranch
		});
		invalidateBranchRouteCache(DRAFT_BRANCH);
		const updated = await getBranchStatus(DRAFT_BRANCH, defaultBranch);
		return { behindBy: updated.behindBy, aheadBy: updated.aheadBy };
	} catch (err: unknown) {
		const message =
			(err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
			'Failed to update draft from main.';
		return { behindBy: status.behindBy, aheadBy: status.aheadBy, syncError: message };
	}
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
	let brixYaml: string | undefined;

	if (file.content && file.encoding === 'base64') {
		const raw = Buffer.from(file.content, 'base64').toString('utf-8');
		if (isBrixYamlFile(file.name)) {
			brixYaml = raw;
		}
		if (file.name.endsWith('.md')) {
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
	}

	return {
		file: {
			name: file.name,
			path: file.path,
			sha: file.sha,
			downloadUrl: file.download_url,
			size: file.size,
			htmlContent,
			frontmatter,
			brixYaml
		}
	};
}

async function loadBranch({ locals }: RequestEvent, match: PageMatch) {
	if (!locals.user) throw redirect(302, '/admin/login');
	if (match.branch !== DRAFT_BRANCH) throw redirect(302, '/admin/routes');

	const mediaDir = normalizeRepoPath(getConfig().mediaDir) ?? '';
	const routesRoot = normalizeRepoPath(getConfig().routesRoot);
	const repo = getRepo();
	const defaultBranch = repo.defaultBranch;
	await ensureDraftBranch();

	let routeTree: RouteNode;
	let behindBy = 0;
	let aheadBy = 0;
	let syncError: string | undefined;
	try {
		const sync = await syncDraftWithDefaultBranch(defaultBranch);
		behindBy = sync.behindBy;
		aheadBy = sync.aheadBy;
		syncError = sync.syncError;
		({ routeTree } = await getBranchRouteSnapshot(match.branch, routesRoot));
	} catch (err: unknown) {
		const e = err as {
			status?: number;
			response?: { status?: number; data?: { message?: string } };
		};
		if (e.status) throw err;
		throw error(e.response?.status ?? 500, e.response?.data?.message ?? 'Failed to load contents');
	}

	let routeRequest: ReturnType<typeof resolveRouteUrlPath>;
	try {
		routeRequest = resolveRouteUrlPath(routeTree, match.path ?? '');
	} catch {
		throw error(404, 'Not found');
	}
	const currentRouteDir = routeRequest.dirPath;

	if (!isWithinRepoRoot(currentRouteDir, routesRoot)) throw error(403, 'Access denied');

	const repoMeta = { name: repo.name, fullName: repo.fullName, mediaPath: mediaDir, routesRoot };

	if (routeRequest.kind === 'page') {
		const currentNode = findRouteNode(routeTree, currentRouteDir);
		const pageFile = currentNode?.page;
		if (!pageFile) throw error(404, 'Not found');

		let filePayload: Record<string, unknown>;
		try {
			filePayload = await loadBranchFile(match.branch, pageFile.filePath, mediaDir);
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
			filePath: pageFile.filePath,
			explorerRoot: routesRoot,
			parentPath: parentPathForPage(file.path, routeTree),
			breadcrumbs: routeBreadcrumbs(routeTree, file.path),
			...filePayload,
			entries: [],
			childDirNames: [],
			childPageNames: [],
			behindBy,
			aheadBy,
			syncError
		};
	}

	const currentNode = findRouteNode(routeTree, currentRouteDir);
	if (!currentNode) throw error(404, 'Not found');

	return {
		repo: repoMeta,
		branch: match.branch,
		defaultBranch,
		filePath: currentRouteDir,
		explorerRoot: routesRoot,
		parentPath: routeRequest.path ? parentPathFor(currentRouteDir, routeTree) : null,
		breadcrumbs: routeBreadcrumbs(routeTree, currentRouteDir),
		entries: getExplorerListing(routeTree, currentRouteDir),
		childDirNames: childDirNames(routeTree, currentRouteDir),
		childPageNames: childPageNames(routeTree, currentRouteDir),
		behindBy,
		aheadBy,
		syncError
	};
}

async function loadPublish({ locals }: RequestEvent, match: PageMatch) {
	if (!locals.user) throw redirect(302, '/admin/login');
	if (match.branch !== DRAFT_BRANCH) throw redirect(302, '/admin/routes');

	const repo = getRepo();
	const defaultBranch = repo.defaultBranch;
	const branch = DRAFT_BRANCH;
	await ensureDraftBranch();

	const { aheadBy, behindBy } = await getBranchStatus(branch, defaultBranch);
	if (aheadBy === 0) throw redirect(302, '/admin/routes');

	const octokit = getOctokit();
	let comparison: {
		total_commits: number;
		files?: Array<{
			filename: string;
			status: string;
			additions: number;
			deletions: number;
			patch?: string;
		}>;
	};

	try {
		const { data } = await octokit.request('GET /repos/{owner}/{repo}/compare/{basehead}', {
			owner: repo.owner,
			repo: repo.name,
			basehead: `${defaultBranch}...${branch}`
		});
		comparison = data;
	} catch (err: unknown) {
		const e = err as {
			status?: number;
			response?: { status?: number; data?: { message?: string } };
		};
		if (e.status) throw err;
		throw error(
			e.response?.status ?? 500,
			e.response?.data?.message ?? 'Failed to load comparison'
		);
	}

	const files = (comparison.files ?? []).map((file) => ({
		filename: file.filename,
		status: file.status,
		additions: file.additions,
		deletions: file.deletions,
		patch: file.patch ?? ''
	}));

	return {
		repo: { name: repo.name, fullName: repo.fullName },
		branch,
		defaultBranch,
		aheadBy,
		behindBy,
		totalCommits: comparison.total_commits,
		files
	};
}

async function loadMedia({ locals }: RequestEvent, match: PageMatch) {
	if (!locals.user) throw redirect(302, '/admin/login');

	const mediaDir = normalizeRepoPath(getConfig().mediaDir) ?? '';
	const repo = getRepo();
	const defaultBranch = repo.defaultBranch;
	await ensureDraftBranch();

	const branch = DRAFT_BRANCH;
	const currentPath = normalizeRepoPath(match.path ? `${mediaDir}/${match.path}` : mediaDir);

	if (mediaDir && !isWithinRepoRoot(currentPath, mediaDir)) {
		throw error(403, 'Access denied');
	}

	const octokit = getOctokit();
	let entries: any[] = [];
	let loadError = '';

	try {
		const { data } = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
			owner: repo.owner,
			repo: repo.name,
			path: currentPath,
			ref: branch
		});

		if (Array.isArray(data)) {
			entries = data
				.map((item) => ({
					name: item.name,
					path: item.path,
					type: item.type as 'file' | 'dir',
					downloadUrl: item.download_url as string | null,
					sha: item.sha
				}))
				.filter((item) => {
					if (item.name === '.gitkeep') return false;
					if (item.type === 'dir') {
						return !mediaDir || isWithinRepoRoot(item.path, mediaDir);
					}
					return !mediaDir || isWithinRepoRoot(item.path, mediaDir);
				})
				.sort((a, b) => {
					if (a.type === b.type) return a.name.localeCompare(b.name);
					return a.type === 'dir' ? -1 : 1;
				});
		}
	} catch (err: any) {
		const e = err as { response?: { status?: number; data?: { message?: string } } };
		if (e.response?.status !== 404) {
			loadError = e.response?.data?.message ?? 'Failed to load media files.';
		}
	}

	const relativeSegments = match.path ? match.path.split('/').filter(Boolean) : [];
	const breadcrumbs = [
		{ label: 'Media', path: '' },
		...relativeSegments.map((segment, index) => {
			const subPath = relativeSegments.slice(0, index + 1).join('/');
			return {
				label: segment,
				path: subPath
			};
		})
	];

	return {
		repo: { name: repo.name, fullName: repo.fullName, mediaPath: mediaDir },
		branch,
		defaultBranch,
		currentPath,
		relativePath: match.path ?? '',
		entries,
		breadcrumbs,
		loadError
	};
}

export async function loadDashboard(event: RequestEvent) {
	if (event.url.pathname.startsWith('/__brixter')) throw error(404, 'Not found');

	const configIssues = getCoreConfigIssues();
	if (configIssues.length > 0) {
		return {
			page: 'config-error' as const,
			showNav: false,
			pageData: { issues: configIssues }
		};
	}

	const match = matchPage(event.url.pathname);

	if (match.page === 'config-error') {
		throw redirect(302, '/admin/routes');
	}

	if (!isSetupComplete() && match.page !== 'setup') {
		throw redirect(302, '/admin/setup');
	}

	if (isSetupComplete() && match.page === 'setup') {
		throw redirect(302, '/admin/routes');
	}

	const isPublic = match.page === 'login' || match.page === 'setup';

	if (!isPublic && !event.locals.user) throw redirect(302, '/admin/login');

	let pageData: Record<string, unknown>;
	switch (match.page) {
		case 'login':
			pageData = await loadLogin(event);
			break;
		case 'setup':
			pageData = {};
			break;
		case 'accounts':
			pageData = await loadAccounts(event);
			break;
		case 'branch':
			pageData = await loadBranch(event, match);
			break;
		case 'media':
			pageData = await loadMedia(event, match);
			break;
		case 'publish':
			pageData = await loadPublish(event, match);
			break;
	}

	return {
		page: match.page,
		showNav: Boolean(event.locals.user) && match.page !== 'login' && match.page !== 'setup',
		pageData
	};
}

function getSetCookieHeaders(headers: Headers): string[] {
	const getSetCookie = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
	const values = getSetCookie?.call(headers);
	if (values?.length) return values;

	const header = headers.get('set-cookie');
	if (!header) return [];
	return header.split(/,(?=\s*[^;,=\s]+=)/).map((value) => value.trim());
}

function applySetCookieHeaders(headers: Headers, cookies: RequestEvent['cookies']) {
	const setCookieHeaders = getSetCookieHeaders(headers);
	for (const header of setCookieHeaders) {
		const [pair, ...attributes] = header.split(';').map((part) => part.trim());
		const separator = pair.indexOf('=');
		if (separator === -1) continue;

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
			if (key === 'domain' && rawValue) options.domain = rawValue;
			if (key === 'expires' && rawValue) options.expires = new Date(rawValue);
			if (key === 'samesite' && rawValue) {
				options.sameSite = rawValue.toLowerCase() as 'strict' | 'lax' | 'none';
			}
		}

		cookies.set(name, value, options);
	}
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

	throw redirect(302, '/admin/routes');
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
		await auth.api.signUpEmail({ body: { email, password, name } });
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

	throw redirect(302, '/admin/routes');
}

async function inviteAccountAction({ request, locals }: RequestEvent) {
	if (!locals.user) throw redirect(302, '/admin/login');

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
		await getAuth().api.signUpEmail({ body: { email, password, name } });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Account creation failed.';
		return fail(400, { message, name, email });
	}

	return { success: true };
}

async function mergeAction({ locals, url }: RequestEvent) {
	if (!locals.user) throw redirect(302, '/admin/login');

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
		invalidateBranchRouteCache(match.branch);
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
	const brixYaml = formData.get('brixYaml')?.toString() ?? '';
	const sha = formData.get('sha')?.toString() ?? '';
	const routesRoot = normalizeRepoPath(getConfig().routesRoot);
	let routeTree: RouteNode;

	try {
		({ routeTree } = await getBranchRouteSnapshot(match.branch, routesRoot));
	} catch (err: unknown) {
		const e = err as { response?: { status?: number; data?: { message?: string } } };
		return fail(e.response?.status ?? 500, {
			saveError: e.response?.data?.message ?? 'Failed to resolve page.'
		});
	}

	let routeRequest: ReturnType<typeof resolveRouteUrlPath>;
	try {
		routeRequest = resolveRouteUrlPath(routeTree, match.path ?? '');
	} catch {
		return fail(404, { saveError: 'Not found.' });
	}

	if (routeRequest.kind !== 'page' || !sha) {
		return fail(400, { saveError: 'Missing file path or sha.' });
	}
	if (!isWithinRepoRoot(routeRequest.dirPath, routesRoot)) {
		return fail(403, { saveError: 'Access denied.' });
	}

	let filePath: string;
	const pageFile = findRouteNode(routeTree, routeRequest.dirPath)?.page;
	if (!pageFile) return fail(404, { saveError: 'Not found.' });
	filePath = pageFile.filePath;

	const fileContent = isBrixYamlFile(filePath)
		? brixYaml
		: frontmatterYaml.trim()
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
		invalidateBranchRouteCache(match.branch);
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
	let routeTree: RouteNode;
	try {
		({ routeTree } = await getBranchRouteSnapshot(match.branch, routesRoot));
	} catch (err: unknown) {
		const e = err as { response?: { status?: number; data?: { message?: string } } };
		return fail(e.response?.status ?? 500, {
			createDirectoryError: e.response?.data?.message ?? 'Failed to check directory.',
			directoryName: name
		});
	}

	let routeRequest: ReturnType<typeof resolveRouteUrlPath>;
	try {
		routeRequest = resolveRouteUrlPath(routeTree, match.path ?? '');
	} catch {
		return fail(404, { createDirectoryError: 'Not found.', directoryName: name });
	}

	const currentPath = routeRequest.dirPath;
	if (!isWithinRepoRoot(currentPath, routesRoot)) {
		return fail(403, { createDirectoryError: 'Access denied.', directoryName: name });
	}

	const directoryPath = `${currentPath}/${name}`;
	if (!isWithinRepoRoot(directoryPath, routesRoot)) {
		return fail(403, { createDirectoryError: 'Access denied.', directoryName: name });
	}

	const octokit = getOctokit();
	const repo = getRepo();
	let directoryAlreadyExists = false;

	try {
		const { data } = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
			owner: repo.owner,
			repo: repo.name,
			path: directoryPath,
			ref: match.branch
		});

		if (Array.isArray(data)) {
			directoryAlreadyExists = true;
		} else {
			return fail(409, {
				createDirectoryError: `A file named "${name}" already exists.`,
				directoryName: name
			});
		}
	} catch (err: unknown) {
		const e = err as { response?: { status?: number; data?: { message?: string } } };
		if (e.response?.status !== 404) {
			return fail(e.response?.status ?? 500, {
				createDirectoryError: e.response?.data?.message ?? 'Failed to check directory.',
				directoryName: name
			});
		}
	}

	if (directoryAlreadyExists) {
		throw redirect(303, routesHref(routeDirUrlPath(routesRoot, directoryPath)));
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
		invalidateBranchRouteCache(match.branch);
	} catch (err: unknown) {
		const e = err as { response?: { status?: number; data?: { message?: string } } };
		return fail(e.response?.status ?? 500, {
			createDirectoryError: e.response?.data?.message ?? 'Failed to create directory.',
			directoryName: name
		});
	}

	throw redirect(303, routesHref(routeDirUrlPath(routesRoot, directoryPath)));
}

async function createPageAction({ request, locals, url }: RequestEvent) {
	if (!locals.user) throw redirect(302, '/admin/login');

	const match = matchPage(url.pathname);
	if (match.page !== 'branch' || !match.branch) return fail(404, { createPageError: 'Not found.' });

	const formData = await request.formData();
	const name = formData.get('page_name')?.toString().trim() ?? '';
	const validationError = validateDirectoryName(name);
	if (validationError) return fail(400, { createPageError: validationError, pageName: name });

	const routesRoot = normalizeRepoPath(getConfig().routesRoot);
	let routeTree: RouteNode;
	let tree: TreeEntry[];
	try {
		({ routeTree, tree } = await getBranchRouteSnapshot(match.branch, routesRoot));
	} catch (err: unknown) {
		const e = err as { response?: { status?: number; data?: { message?: string } } };
		return fail(e.response?.status ?? 500, {
			createPageError: e.response?.data?.message ?? 'Failed to check route.',
			pageName: name
		});
	}

	let routeRequest: ReturnType<typeof resolveRouteUrlPath>;
	try {
		routeRequest = resolveRouteUrlPath(routeTree, match.path ?? '');
	} catch {
		return fail(404, { createPageError: 'Not found.', pageName: name });
	}

	const currentPath = routeRequest.dirPath;
	if (!isWithinRepoRoot(currentPath, routesRoot)) {
		return fail(403, { createPageError: 'Access denied.', pageName: name });
	}

	const directoryPath = `${currentPath}/${name}`;
	if (!isWithinRepoRoot(directoryPath, routesRoot)) {
		return fail(403, { createPageError: 'Access denied.', pageName: name });
	}

	const octokit = getOctokit();
	const repo = getRepo();

	const existingRoute = childRoute(routeTree, currentPath, name);
	const existingBlob = tree.find((entry) => entry.type === 'blob' && entry.path === directoryPath);

	if (existingBlob) {
		return fail(409, {
			createPageError: `A file named "${name}" already exists.`,
			pageName: name
		});
	}

	if (existingRoute?.page) {
		return fail(409, {
			createPageError: `Route "${name}" already has a page.`,
			pageName: name
		});
	}

	const title = titleFromRouteName(name);
	const fileContent = `title: ${JSON.stringify(title)}
description: ''

components: []
`;

	try {
		await octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', {
			owner: repo.owner,
			repo: repo.name,
			path: `${directoryPath}/+page.brix.yaml`,
			message: `Create ${directoryPath}/+page.brix.yaml`,
			content: Buffer.from(fileContent).toString('base64'),
			branch: match.branch
		});
		invalidateBranchRouteCache(match.branch);
	} catch (err: unknown) {
		const e = err as { response?: { status?: number; data?: { message?: string } } };
		return fail(e.response?.status ?? 500, {
			createPageError: e.response?.data?.message ?? 'Failed to create page.',
			pageName: name
		});
	}

	throw redirect(303, routesHref(routePageUrlPath(routesRoot, directoryPath)));
}

async function createMediaDirectoryAction({ request, locals, url }: RequestEvent) {
	if (!locals.user) throw redirect(302, '/admin/login');

	const match = matchPage(url.pathname);
	if (match.page !== 'media' || !match.branch)
		return fail(404, { createDirectoryError: 'Not found.' });

	const formData = await request.formData();
	const name = formData.get('directory_name')?.toString().trim() ?? '';
	const validationError = validateDirectoryName(name);
	if (validationError)
		return fail(400, { createDirectoryError: validationError, directoryName: name });

	const mediaDir = normalizeRepoPath(getConfig().mediaDir) ?? '';
	const currentPath = normalizeRepoPath(match.path ? `${mediaDir}/${match.path}` : mediaDir);
	if (mediaDir && !isWithinRepoRoot(currentPath, mediaDir)) {
		return fail(403, { createDirectoryError: 'Access denied.', directoryName: name });
	}

	const targetDir = `${currentPath}/${name}`;
	const targetPath = normalizeRepoPath(`${targetDir}/.gitkeep`);
	if (mediaDir && !isWithinRepoRoot(targetPath, mediaDir)) {
		return fail(403, { createDirectoryError: 'Access denied.', directoryName: name });
	}

	const octokit = getOctokit();
	const repo = getRepo();

	try {
		await octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', {
			owner: repo.owner,
			repo: repo.name,
			path: targetPath,
			message: `Create directory ${name}`,
			content: Buffer.from('').toString('base64'),
			branch: match.branch
		});

		if (process.env.NODE_ENV !== 'production') {
			try {
				const fs = await import('node:fs/promises');
				const pathLib = await import('node:path');
				const localPath = await resolveLocalPath(targetPath);
				await fs.mkdir(pathLib.dirname(localPath), { recursive: true });
				await fs.writeFile(localPath, '');
			} catch (fsErr) {
				console.error('Failed to create local directory:', fsErr);
			}
		}
	} catch (err: unknown) {
		const e = err as { response?: { status?: number; data?: { message?: string } } };
		return fail(e.response?.status ?? 500, {
			createDirectoryError: e.response?.data?.message ?? 'Failed to create directory.',
			directoryName: name
		});
	}

	return { createDirectorySuccess: true };
}

async function uploadMediaAction({ request, locals, url }: RequestEvent) {
	if (!locals.user) throw redirect(302, '/admin/login');

	const match = matchPage(url.pathname);
	if (match.page !== 'media' || !match.branch)
		return fail(404, { uploadError: 'Not found.' });

	const formData = await request.formData();
	const files = formData.getAll('files');
	if (files.length === 0) {
		return fail(400, { uploadError: 'No files provided.' });
	}

	const mediaDir = normalizeRepoPath(getConfig().mediaDir) ?? '';
	const currentPath = normalizeRepoPath(match.path ? `${mediaDir}/${match.path}` : mediaDir);
	if (mediaDir && !isWithinRepoRoot(currentPath, mediaDir)) {
		return fail(403, { uploadError: 'Access denied.' });
	}

	const octokit = getOctokit();
	const repo = getRepo();

	for (const file of files) {
		if (!file || typeof (file as any).arrayBuffer !== 'function') {
			continue;
		}

		const fileName = (file as any).name;
		if (!fileName) continue;

		const targetPath = normalizeRepoPath(`${currentPath}/${fileName}`);
		if (mediaDir && !isWithinRepoRoot(targetPath, mediaDir)) {
			return fail(403, { uploadError: `Access denied for ${fileName}.` });
		}

		try {
			const arrayBuffer = await (file as any).arrayBuffer();
			const base64Content = Buffer.from(arrayBuffer).toString('base64');

			await octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', {
				owner: repo.owner,
				repo: repo.name,
				path: targetPath,
				message: `Upload ${fileName}`,
				content: base64Content,
				branch: match.branch
			});

			if (process.env.NODE_ENV !== 'production') {
				try {
					const fs = await import('node:fs/promises');
					const pathLib = await import('node:path');
					const localPath = await resolveLocalPath(targetPath);
					await fs.mkdir(pathLib.dirname(localPath), { recursive: true });
					await fs.writeFile(localPath, Buffer.from(arrayBuffer));
				} catch (fsErr) {
					console.error('Failed to write uploaded file locally:', fsErr);
				}
			}
		} catch (err: any) {
			const e = err as { response?: { status?: number; data?: { message?: string } } };
			return fail(e.response?.status ?? 500, {
				uploadError: e.response?.data?.message ?? `Upload failed for ${fileName}.`
			});
		}
	}

	return { uploadSuccess: true };
}

type RouteDeleteKind = 'page' | 'route';

function collectRouteDeletePaths(
	kind: RouteDeleteKind,
	routeDirPath: string,
	filePath: string | undefined,
	tree: TreeEntry[],
	routesRoot: string
): string[] {
	if (kind === 'page') {
		return filePath ? [filePath] : [];
	}

	if (routeDirPath === routesRoot) return [];

	const prefix = `${routeDirPath}/`;
	return tree
		.filter((entry) => entry.type === 'blob' && entry.path.startsWith(prefix))
		.map((entry) => entry.path);
}

interface GitBlobEntry {
	path: string;
	sha: string;
}

async function fetchBranchGitBlobs(branch: string): Promise<GitBlobEntry[]> {
	const octokit = getOctokit();
	const repo = getRepo();

	let treeItems: Array<{ path?: string; type?: string; sha?: string }>;

	try {
		const { data: tree } = await octokit.request('GET /repos/{owner}/{repo}/git/trees/{tree_sha}', {
			owner: repo.owner,
			repo: repo.name,
			tree_sha: branch,
			recursive: '1'
		});
		treeItems = tree.tree ?? [];
	} catch (err: unknown) {
		const e = err as { status?: number; response?: { status?: number } };
		const status = e.status ?? e.response?.status;
		if (status !== 404 && status !== 422) throw err;

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
		treeItems = tree.tree ?? [];
	}

	return treeItems
		.filter((item) => item.type === 'blob' && item.path && item.sha)
		.map((item) => ({ path: item.path as string, sha: item.sha as string }));
}

function collectBlobsUnderDir(routeDirPath: string, blobs: GitBlobEntry[]): GitBlobEntry[] {
	const prefix = `${routeDirPath}/`;
	return blobs.filter((blob) => blob.path.startsWith(prefix));
}

function remapRepoPath(path: string, fromDir: string, toDir: string): string {
	const prefix = `${fromDir}/`;
	if (!path.startsWith(prefix)) {
		throw new Error(`Path ${path} is not under ${fromDir}`);
	}
	return `${toDir}${path.slice(fromDir.length)}`;
}

async function commitTreeChanges(
	branch: string,
	treeItems: Array<{
		path: string;
		mode: '100644';
		type: 'blob';
		sha: string | null;
	}>,
	message: string
): Promise<void> {
	if (treeItems.length === 0) return;

	const octokit = getOctokit();
	const repo = getRepo();

	const { data: ref } = await octokit.request('GET /repos/{owner}/{repo}/git/ref/{ref}', {
		owner: repo.owner,
		repo: repo.name,
		ref: `heads/${branch}`
	});
	const commitSha = ref.object.sha;

	const { data: commit } = await octokit.request(
		'GET /repos/{owner}/{repo}/git/commits/{commit_sha}',
		{
			owner: repo.owner,
			repo: repo.name,
			commit_sha: commitSha
		}
	);

	const { data: newTree } = await octokit.request('POST /repos/{owner}/{repo}/git/trees', {
		owner: repo.owner,
		repo: repo.name,
		base_tree: commit.tree.sha,
		tree: treeItems
	});

	const { data: newCommit } = await octokit.request('POST /repos/{owner}/{repo}/git/commits', {
		owner: repo.owner,
		repo: repo.name,
		message,
		tree: newTree.sha,
		parents: [commitSha]
	});

	await octokit.request('PATCH /repos/{owner}/{repo}/git/refs/{ref}', {
		owner: repo.owner,
		repo: repo.name,
		ref: `heads/${branch}`,
		sha: newCommit.sha
	});
}

async function deletePathsFromBranch(branch: string, pathsToDelete: string[]): Promise<void> {
	const treeItems = pathsToDelete.map((path) => ({
		path,
		mode: '100644' as const,
		type: 'blob' as const,
		sha: null
	}));

	const messageLabel =
		pathsToDelete.length === 1
			? pathsToDelete[0].split('/').pop()
			: `${pathsToDelete.length} route files`;

	await commitTreeChanges(branch, treeItems, `Delete ${messageLabel}`);
}

async function moveRouteDirOnBranch(
	branch: string,
	routeDirPath: string,
	newRouteDirPath: string,
	blobs: GitBlobEntry[]
): Promise<void> {
	const treeItems = [
		...blobs.map(({ path, sha }) => ({
			path: remapRepoPath(path, routeDirPath, newRouteDirPath),
			mode: '100644' as const,
			type: 'blob' as const,
			sha
		})),
		...blobs.map(({ path }) => ({
			path,
			mode: '100644' as const,
			type: 'blob' as const,
			sha: null
		}))
	];

	const label = routeDirPath.split('/').pop() ?? routeDirPath;
	await commitTreeChanges(branch, treeItems, `Rename ${label}`);
}

async function deleteRouteAction({ request, locals, url }: RequestEvent) {
	if (!locals.user) throw redirect(302, '/admin/login');

	const match = matchPage(url.pathname);
	if (match.page !== 'branch' || !match.branch) return fail(404, { deleteError: 'Not found.' });

	const formData = await request.formData();
	const kind = formData.get('kind')?.toString() as RouteDeleteKind | undefined;
	const routeDirPath = normalizeRepoPath(formData.get('routeDirPath')?.toString() ?? '');
	const filePath = normalizeRepoPath(formData.get('filePath')?.toString() ?? '');

	if (kind !== 'page' && kind !== 'route') {
		return fail(400, { deleteError: 'Invalid delete target.' });
	}
	if (!routeDirPath) {
		return fail(400, { deleteError: 'Route path is required.' });
	}

	const routesRoot = normalizeRepoPath(getConfig().routesRoot);
	if (!isWithinRepoRoot(routeDirPath, routesRoot)) {
		return fail(403, { deleteError: 'Access denied.' });
	}
	if (kind === 'route' && routeDirPath === routesRoot) {
		return fail(403, { deleteError: 'The routes root cannot be deleted.' });
	}
	if (kind === 'page' && (!filePath || !isWithinRepoRoot(filePath, routesRoot))) {
		return fail(400, { deleteError: 'Page path is required.' });
	}

	let pathsToDelete: string[] = [];
	try {
		const { tree } = await getBranchRouteSnapshot(match.branch, routesRoot);
		pathsToDelete = collectRouteDeletePaths(kind, routeDirPath, filePath, tree, routesRoot);
	} catch (err: unknown) {
		const e = err as { response?: { status?: number; data?: { message?: string } } };
		return fail(e.response?.status ?? 500, {
			deleteError: e.response?.data?.message ?? 'Failed to resolve route files.'
		});
	}

	if (pathsToDelete.length === 0) {
		return fail(404, { deleteError: 'Nothing to delete.' });
	}

	try {
		await deletePathsFromBranch(match.branch, pathsToDelete);
		invalidateBranchRouteCache(match.branch);

		if (process.env.NODE_ENV !== 'production') {
			try {
				const fs = await import('node:fs/promises');
				if (kind === 'route') {
					await fs.rm(await resolveLocalPath(routeDirPath), { recursive: true, force: true });
				} else {
					await fs.rm(await resolveLocalPath(filePath), { force: true });
				}
			} catch (fsErr) {
				console.error('Failed to delete local route files:', fsErr);
			}
		}
	} catch (err: unknown) {
		const e = err as { response?: { status?: number; data?: { message?: string } } };
		return fail(e.response?.status ?? 500, {
			deleteError: e.response?.data?.message ?? 'Delete failed.'
		});
	}

	return { deleteSuccess: true };
}

async function renameRouteAction({ request, locals, url }: RequestEvent) {
	if (!locals.user) throw redirect(302, '/admin/login');

	const match = matchPage(url.pathname);
	if (match.page !== 'branch' || !match.branch) return fail(404, { renameError: 'Not found.' });

	const formData = await request.formData();
	const routeDirPath = normalizeRepoPath(formData.get('routeDirPath')?.toString() ?? '');
	const newName = formData.get('new_name')?.toString().trim() ?? '';

	const validationError = validateDirectoryName(newName);
	if (validationError) return fail(400, { renameError: validationError, newName });

	if (!routeDirPath) {
		return fail(400, { renameError: 'Route path is required.' });
	}

	const routesRoot = normalizeRepoPath(getConfig().routesRoot);
	if (!isWithinRepoRoot(routeDirPath, routesRoot)) {
		return fail(403, { renameError: 'Access denied.' });
	}
	if (routeDirPath === routesRoot) {
		return fail(403, { renameError: 'The routes root cannot be renamed.' });
	}

	const oldSegment = routeDirPath.split('/').pop() ?? '';
	if (oldSegment.toLowerCase() === newName.toLowerCase()) {
		return fail(400, { renameError: 'Name is unchanged.', newName });
	}

	const parentDir = routeDirPath.slice(0, routeDirPath.lastIndexOf('/'));
	const newRouteDirPath = `${parentDir}/${newName}`;
	if (!isWithinRepoRoot(newRouteDirPath, routesRoot)) {
		return fail(403, { renameError: 'Access denied.', newName });
	}

	try {
		const { routeTree } = await getBranchRouteSnapshot(match.branch, routesRoot);
		const siblingDirs = childDirNames(routeTree, parentDir);
		const siblingPages = childPageNames(routeTree, parentDir);
		const taken = new Set(
			[...siblingDirs, ...siblingPages]
				.filter((name) => name.toLowerCase() !== oldSegment.toLowerCase())
				.map((name) => name.toLowerCase())
		);
		if (taken.has(newName.toLowerCase())) {
			return fail(409, {
				renameError: `A route named "${newName}" already exists.`,
				newName
			});
		}
	} catch (err: unknown) {
		const e = err as { response?: { status?: number; data?: { message?: string } } };
		return fail(e.response?.status ?? 500, {
			renameError: e.response?.data?.message ?? 'Failed to check route name.',
			newName
		});
	}

	let blobsToMove: GitBlobEntry[] = [];
	try {
		const allBlobs = await fetchBranchGitBlobs(match.branch);
		blobsToMove = collectBlobsUnderDir(routeDirPath, allBlobs);
	} catch (err: unknown) {
		const e = err as { response?: { status?: number; data?: { message?: string } } };
		return fail(e.response?.status ?? 500, {
			renameError: e.response?.data?.message ?? 'Failed to resolve route files.',
			newName
		});
	}

	if (blobsToMove.length === 0) {
		return fail(404, { renameError: 'Nothing to rename.', newName });
	}

	try {
		await moveRouteDirOnBranch(match.branch, routeDirPath, newRouteDirPath, blobsToMove);
		invalidateBranchRouteCache(match.branch);

		if (process.env.NODE_ENV !== 'production') {
			try {
				const fs = await import('node:fs/promises');
				await fs.rename(
					await resolveLocalPath(routeDirPath),
					await resolveLocalPath(newRouteDirPath)
				);
			} catch (fsErr) {
				console.error('Failed to rename local route directory:', fsErr);
			}
		}
	} catch (err: unknown) {
		const e = err as { response?: { status?: number; data?: { message?: string } } };
		return fail(e.response?.status ?? 500, {
			renameError: e.response?.data?.message ?? 'Rename failed.',
			newName
		});
	}

	throw redirect(303, routesHref(routeDirUrlPath(routesRoot, newRouteDirPath)));
}

async function deleteMediaAction({ request, locals, url }: RequestEvent) {
	if (!locals.user) throw redirect(302, '/admin/login');

	const match = matchPage(url.pathname);
	if (match.page !== 'media' || !match.branch)
		return fail(404, { deleteError: 'Not found.' });

	const formData = await request.formData();
	const itemPath = normalizeRepoPath(formData.get('itemPath')?.toString() ?? '');
	const isDir = formData.get('isDir')?.toString() === 'true';
	const sha = formData.get('sha')?.toString();

	const mediaDir = normalizeRepoPath(getConfig().mediaDir) ?? '';
	if (!itemPath) {
		return fail(400, { deleteError: 'Item path is required.' });
	}
	if (mediaDir && !isWithinRepoRoot(itemPath, mediaDir)) {
		return fail(403, { deleteError: 'Access denied.' });
	}

	const pathToDelete = isDir ? normalizeRepoPath(`${itemPath}/.gitkeep`) : itemPath;
	const octokit = getOctokit();
	const repo = getRepo();

	let fileSha = sha;
	if (!fileSha) {
		try {
			const { data: fileData } = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
				owner: repo.owner,
				repo: repo.name,
				path: pathToDelete,
				ref: match.branch
			});
			if (!Array.isArray(fileData)) {
				fileSha = fileData.sha;
			}
		} catch (err) {
			// ignore
		}
	}

	if (!fileSha && !isDir) {
		return fail(400, { deleteError: 'Failed to retrieve file SHA.' });
	}

	try {
		if (fileSha) {
			await octokit.request('DELETE /repos/{owner}/{repo}/contents/{path}', {
				owner: repo.owner,
				repo: repo.name,
				path: pathToDelete,
				message: `Delete ${pathToDelete.split('/').pop()}`,
				sha: fileSha,
				branch: match.branch
			});
		}

		if (process.env.NODE_ENV !== 'production') {
			try {
				const fs = await import('node:fs/promises');
				const localPath = await resolveLocalPath(itemPath);
				await fs.rm(localPath, { recursive: true, force: true });
			} catch (fsErr) {
				console.error('Failed to delete local file/directory:', fsErr);
			}
		}
	} catch (err: any) {
		const e = err as { response?: { status?: number; data?: { message?: string } } };
		return fail(e.response?.status ?? 500, {
			deleteError: e.response?.data?.message ?? 'Delete failed.'
		});
	}

	return { deleteSuccess: true };
}

async function publishAction({ locals, url }: RequestEvent) {
	if (!locals.user) throw redirect(302, '/admin/login');

	const match = matchPage(url.pathname);
	if (match.page !== 'publish') return fail(404, { publishError: 'Not found.' });

	const octokit = getOctokit();
	const repo = getRepo();
	const defaultBranch = repo.defaultBranch;
	const branch = DRAFT_BRANCH;

	const { aheadBy } = await getBranchStatus(branch, defaultBranch);
	if (aheadBy === 0) throw redirect(302, '/admin/routes');

	try {
		const { data: pr } = await octokit.request('POST /repos/{owner}/{repo}/pulls', {
			owner: repo.owner,
			repo: repo.name,
			title: 'Publish draft changes',
			head: branch,
			base: defaultBranch
		});

		const { data: mergeResult } = await octokit.request(
			'PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge',
			{
				owner: repo.owner,
				repo: repo.name,
				pull_number: pr.number,
				merge_method: 'squash'
			}
		);

		const mergeSha = mergeResult.sha;
		if (!mergeSha) return fail(500, { publishError: 'Merge did not return a commit SHA.' });

		await octokit.request('PATCH /repos/{owner}/{repo}/git/refs/heads/{ref}', {
			owner: repo.owner,
			repo: repo.name,
			ref: branch,
			sha: mergeSha,
			force: true
		});

		invalidateBranchRouteCache(branch);
	} catch (err: unknown) {
		const e = err as { response?: { status?: number; data?: { message?: string } } };
		return fail(e.response?.status ?? 500, {
			publishError: e.response?.data?.message ?? 'Publish failed.'
		});
	}

	throw redirect(302, '/admin/routes');
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
	inviteAccount: async (event) => {
		if (event.url.pathname.startsWith('/__brixter')) throw error(404, 'Not found');
		const match = matchPage(event.url.pathname);
		if (match.page !== 'accounts') throw error(405, 'Method not allowed');
		return inviteAccountAction(event);
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
	},
	createPage: async (event) => {
		if (event.url.pathname.startsWith('/__brixter')) throw error(404, 'Not found');
		return createPageAction(event);
	},
	deleteRoute: async (event) => {
		if (event.url.pathname.startsWith('/__brixter')) throw error(404, 'Not found');
		return deleteRouteAction(event);
	},
	renameRoute: async (event) => {
		if (event.url.pathname.startsWith('/__brixter')) throw error(404, 'Not found');
		return renameRouteAction(event);
	},
	createMediaDirectory: async (event) => {
		if (event.url.pathname.startsWith('/__brixter')) throw error(404, 'Not found');
		return createMediaDirectoryAction(event);
	},
	uploadMedia: async (event) => {
		if (event.url.pathname.startsWith('/__brixter')) throw error(404, 'Not found');
		return uploadMediaAction(event);
	},
	deleteMedia: async (event) => {
		if (event.url.pathname.startsWith('/__brixter')) throw error(404, 'Not found');
		return deleteMediaAction(event);
	},
	publish: async (event) => {
		if (event.url.pathname.startsWith('/__brixter')) throw error(404, 'Not found');
		const match = matchPage(event.url.pathname);
		if (match.page !== 'publish') throw error(405, 'Method not allowed');
		return publishAction(event);
	}
};
