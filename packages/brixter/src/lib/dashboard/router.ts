import { error, fail, redirect, type Actions, type RequestEvent } from '@sveltejs/kit';
import { APIError } from '@better-auth/core/error';
import { parseSetCookieHeader, toCookieOptions } from 'better-auth/cookies';
import { getAuth } from '../server/auth.ts';
import { getConfig, getCoreConfigIssues } from '../server/config.ts';
import { isSetupComplete } from '../server/setup.ts';
import { getDb } from '../server/db.ts';
import { getContentStore, isLocalMode } from '../server/content-store.ts';
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
import { Buffer } from 'node:buffer';

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

function draftBranch(): string {
	return getContentStore().branch;
}

const LEGACY_DRAFT_BRANCHES = ['drafts'];

function repoMeta() {
	const config = getConfig().github;
	return {
		name: config.repoName,
		fullName: `${config.repoOwner}/${config.repoName}`
	};
}

function defaultBranchForConfig(): string {
	return getConfig().github.defaultBranch;
}

function decodePathPart(value: string | undefined): string {
	return decodeURIComponent(value ?? '');
}

const AUTH_ERROR_MESSAGES: Record<string, string> = {
	INVALID_EMAIL_OR_PASSWORD: 'Incorrect email or password.',
	EMAIL_NOT_VERIFIED:
		'Your email is not verified yet. Check your inbox for a verification link, or ask an admin for help.',
	FAILED_TO_CREATE_SESSION: 'We could not start a session. Please try again.',
	EMAIL_PASSWORD_DISABLED: 'Email sign-in is not enabled on this server.',
	INVALID_ORIGIN:
		'This sign-in request was blocked because the site origin does not match server configuration. Set ORIGIN to the exact URL in your browser (scheme, host, and port).',
	INVALID_EMAIL: 'Enter a valid email address.'
};

function formatAuthErrorMessage(error: APIError, fallback: string): string {
	const code =
		typeof error.body === 'object' && error.body !== null && 'code' in error.body
			? String(error.body.code)
			: '';
	if (code && AUTH_ERROR_MESSAGES[code]) return AUTH_ERROR_MESSAGES[code];

	const bodyMessage =
		typeof error.body === 'object' && error.body !== null && 'message' in error.body
			? String(error.body.message)
			: '';
	if (bodyMessage.trim()) return bodyMessage.trim();

	const message = error.message?.trim();
	if (message) return message;

	return fallback;
}

function getActionErrorMessage(
	error: unknown,
	fallback: string
): { message: string; status: number } {
	if (error instanceof APIError) {
		return {
			message: formatAuthErrorMessage(error, fallback),
			status: error.statusCode ?? 400
		};
	}

	const status =
		typeof error === 'object' &&
		error !== null &&
		'statusCode' in error &&
		typeof error.statusCode === 'number'
			? error.statusCode
			: typeof error === 'object' &&
				  error !== null &&
				  'status' in error &&
				  typeof error.status === 'number'
				? error.status
				: 400;

	const candidates = [
		error instanceof Error ? error.message : null,
		typeof error === 'object' &&
		error !== null &&
		'body' in error &&
		typeof error.body === 'object' &&
		error.body !== null &&
		'message' in error.body &&
		typeof error.body.message === 'string'
			? error.body.message
			: null,
		typeof error === 'object' &&
		error !== null &&
		'cause' in error &&
		typeof error.cause === 'object' &&
		error.cause !== null &&
		'message' in error.cause &&
		typeof error.cause.message === 'string'
			? error.cause.message
			: null
	].filter((value): value is string => Boolean(value?.trim()));

	const rawMessage = candidates[0]?.trim();
	if (!rawMessage) return { message: fallback, status };

	if (
		/invalid email or password|invalid.*credential|incorrect.*password|email not found|user not found/i.test(
			rawMessage
		)
	) {
		return { message: 'Incorrect email or password.', status: 401 };
	}

	return { message: rawMessage, status };
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
	const branch = draftBranch();

	if (!path) throw redirect(302, '/admin/routes');
	if (path === 'login') return { page: 'login' };
	if (path === 'setup') return { page: 'setup' };
	if (path === 'config-error') return { page: 'config-error' };
	if (path === 'settings') throw redirect(302, '/admin/routes');
	if (path === 'accounts') return { page: 'accounts' };
	if (path === 'publish') return { page: 'publish', branch };

	const parts = path.split('/');
	if (parts[0] === 'routes') {
		return {
			page: 'branch',
			branch,
			path: decodePathPart(parts.slice(1).join('/'))
		};
	}

	if (parts[0] === 'media') {
		return {
			page: 'media',
			branch,
			path: decodePathPart(parts.slice(1).join('/'))
		};
	}

	if (parts[0] === 'b' && parts[1]) {
		const legacyBranch = decodePathPart(parts[1]);
		if (legacyBranch !== branch && !LEGACY_DRAFT_BRANCHES.includes(legacyBranch)) {
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

async function loadLogin({ locals, url }: RequestEvent) {
	if (!isSetupComplete()) throw redirect(302, '/admin/setup');
	if (locals.user) throw redirect(302, '/admin/routes');

	const reason = url.searchParams.get('reason');
	const notices: Record<string, string> = {
		required: 'Sign in to continue.',
		session:
			'Your session could not be verified. Please sign in again. If this keeps happening, check that ORIGIN matches the URL in your browser.'
	};

	return { notice: reason ? (notices[reason] ?? undefined) : undefined };
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

async function ensureDraftBranch(): Promise<void> {
	const store = getContentStore();
	await store.ensureDraftBranch();
}

async function syncDraftWithDefaultBranch(defaultBranch: string): Promise<{
	behindBy: number;
	aheadBy: number;
	syncError?: string;
}> {
	const store = getContentStore();
	return store.syncWithDefault();
}

async function loadBranchFile(
	filePath: string
): Promise<Record<string, unknown>> {
	const store = getContentStore();
	const result = await store.readFile(filePath);

	let brixYaml: string | undefined;

	const raw = result.content;
	const fileName = filePath.split('/').pop() ?? filePath;

	if (isBrixYamlFile(fileName)) {
		brixYaml = raw;
	}

	return {
		file: {
			name: fileName,
			path: filePath,
			sha: result.sha,
			downloadUrl: result.downloadUrl,
			size: result.size,
			brixYaml
		}
	};
}

async function loadBranch({ locals }: RequestEvent, match: PageMatch) {
	if (!locals.user) throw redirect(302, '/admin/login');
	if (match.branch !== draftBranch()) throw redirect(302, '/admin/routes');

	const mediaDir = normalizeRepoPath(getConfig().mediaDir) ?? '';
	const routesRoot = normalizeRepoPath(getConfig().routesRoot);
	const defaultBranch = defaultBranchForConfig();
	const branch = match.branch!;
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
		({ routeTree } = await getBranchRouteSnapshot(branch, routesRoot));
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

	const rm = repoMeta();
	const repoMetaObj = { name: rm.name, fullName: rm.fullName, mediaPath: mediaDir, routesRoot };

	if (routeRequest.kind === 'page') {
		const currentNode = findRouteNode(routeTree, currentRouteDir);
		const pageFile = currentNode?.page;
		if (!pageFile) throw error(404, 'Not found');

		let filePayload: Record<string, unknown>;
		try {
			filePayload = await loadBranchFile(pageFile.filePath);
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
			repo: repoMetaObj,
			branch,
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
			syncError,
			isLocal: isLocalMode()
		};
	}

	const currentNode = findRouteNode(routeTree, currentRouteDir);
	if (!currentNode) throw error(404, 'Not found');

	return {
		repo: repoMetaObj,
		branch,
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
		syncError,
		isLocal: isLocalMode()
	};
}

async function loadPublish({ locals }: RequestEvent, match: PageMatch) {
	if (!locals.user) throw redirect(302, '/admin/login');
	if (match.branch !== draftBranch()) throw redirect(302, '/admin/routes');

	const defaultBranch = defaultBranchForConfig();
	const branch = draftBranch();
	await ensureDraftBranch();

	const { aheadBy, behindBy } = await getBranchStatus(branch, defaultBranch);
	if (aheadBy === 0) throw redirect(302, '/admin/routes');

	// In local mode, we show an empty comparison
	if (isLocalMode()) {
		return {
			repo: { name: repoMeta().name, fullName: repoMeta().fullName },
			branch,
			defaultBranch,
			aheadBy,
			behindBy,
			totalCommits: 0,
			files: []
		};
	}

	// GitHub mode: fetch comparison
	const { getOctokit, getRepo } = await import('../server/github.ts');
	const octokit = getOctokit();
	const repo = getRepo();

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
	const defaultBranch = defaultBranchForConfig();
	await ensureDraftBranch();

	const branch = draftBranch();
	const currentPath = normalizeRepoPath(match.path ? `${mediaDir}/${match.path}` : mediaDir);

	if (mediaDir && !isWithinRepoRoot(currentPath, mediaDir)) {
		throw error(403, 'Access denied');
	}

	const store = getContentStore();
	let entries: any[] = [];
	let loadError = '';

	try {
		const dirEntries = await store.listDirectory(currentPath);

		if (dirEntries.length > 0) {
			entries = dirEntries
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
		} else if (!isLocalMode()) {
			// Fallback to GitHub API in non-local mode if listDirectory is empty
			// (this happens for brand-new branches)
			const { getOctokit, getRepo } = await import('../server/github.ts');
			const octokit = getOctokit();
			const repo = getRepo();

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

	const rm = repoMeta();
	return {
		repo: { name: rm.name, fullName: rm.fullName, mediaPath: mediaDir },
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

	if (!isPublic && !event.locals.user) {
		throw redirect(302, '/admin/login?reason=required');
	}

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
		isLocal: isLocalMode(),
		pageData
	};
}

function applySetCookieHeaders(headers: Headers, cookies: RequestEvent['cookies']) {
	const getSetCookie = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
	const setCookieValues = getSetCookie?.call(headers);
	const setCookieHeader = setCookieValues?.length
		? setCookieValues.join(', ')
		: headers.get('set-cookie');
	if (!setCookieHeader) return;

	const parsed = parseSetCookieHeader(setCookieHeader);
	for (const [name, attributes] of parsed) {
		try {
			cookies.set(name, attributes.value, {
				...toCookieOptions(attributes),
				path: attributes.path || '/'
			});
		} catch (err) {
			if (process.env.NODE_ENV !== 'production') {
				console.error('brixter failed to set auth cookie', name, err);
			}
		}
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
		if (result.headers) applySetCookieHeaders(result.headers, cookies);

		const session = await getAuth().api.getSession({ headers: request.headers });
		if (!session?.user) {
			return fail(500, {
				message:
					'Sign-in succeeded but your session was not saved. Confirm ORIGIN in your environment matches the URL in your browser (including http/https and port), and that cookies are not blocked.',
				email
			});
		}
	} catch (err) {
		if (process.env.NODE_ENV !== 'production') {
			console.error('brixter login failed', err);
		}
		const { message, status } = getActionErrorMessage(err, 'Sign in failed. Please try again.');
		return fail(status, { message, email });
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
		if (result.headers) applySetCookieHeaders(result.headers, cookies);
	} catch (err) {
		const { message, status } = getActionErrorMessage(err, 'Account creation failed.');
		return fail(status, { message, name, email });
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

	const store = getContentStore();
	try {
		await store.mergeDefaultIntoDraft();
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

	if (routeRequest.kind !== 'page') {
		return fail(400, { saveError: 'Missing file path.' });
	}
	if (!isWithinRepoRoot(routeRequest.dirPath, routesRoot)) {
		return fail(403, { saveError: 'Access denied.' });
	}

	const pageFile = findRouteNode(routeTree, routeRequest.dirPath)?.page;
	if (!pageFile) return fail(404, { saveError: 'Not found.' });
	const filePath = pageFile.filePath;

	const fileContent = isBrixYamlFile(filePath)
		? brixYaml
		: frontmatterYaml.trim()
			? `---\n${frontmatterYaml.trim()}\n---\n${markdown}`
			: markdown;

	const store = getContentStore();
	try {
		await store.writeFile(filePath, fileContent, sha || undefined);
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

	// Check if directory or file already exists
	const store = getContentStore();
	if (store.isLocal) {
		const existing = await store.listDirectory(directoryPath);
		const routeNode = findRouteNode(routeTree, directoryPath);
		if (existing.length > 0 || routeNode) {
			throw redirect(303, routesHref(routeDirUrlPath(routesRoot, directoryPath)));
		}
	} else {
		// GitHub mode: check via API
		const { getOctokit, getRepo } = await import('../server/github.ts');
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

	// Local mode: create directory directly
	try {
		await store.createDirectory(directoryPath);
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

	const store = getContentStore();
	try {
		await store.writeFile(`${directoryPath}/+page.brix.yaml`, fileContent);
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
	if (mediaDir && !isWithinRepoRoot(targetDir, mediaDir)) {
		return fail(403, { createDirectoryError: 'Access denied.', directoryName: name });
	}

	const store = getContentStore();
	try {
		await store.createDirectory(targetDir);
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

	const store = getContentStore();

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
			await store.writeFile(targetPath, Buffer.from(arrayBuffer));
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

	const store = getContentStore();
	try {
		if (kind === 'route' && store.isLocal) {
			// In local mode, delete the entire directory
			await store.deleteFile(routeDirPath);
		} else if (kind === 'page' && store.isLocal) {
			await store.deleteFile(filePath);
		} else {
			// GitHub mode: delete individual files via API
			for (const path of pathsToDelete) {
				await store.deleteFile(path);
			}
		}
		invalidateBranchRouteCache(match.branch);
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

	const store = getContentStore();

	if (store.isLocal) {
		// Local mode: rename directory using fs
		try {
			const fs = await import('node:fs/promises');
			const pathLib = await import('node:path');

			// Resolve paths relative to repo root
			let root = process.cwd();
			while (true) {
				const gitPath = pathLib.resolve(root, '.git');
				const hasGit = await fs.access(gitPath).then(() => true).catch(() => false);
				if (hasGit) break;
				const parent = pathLib.dirname(root);
				if (parent === root) break;
				root = parent;
			}

			const oldPath = pathLib.resolve(root, routeDirPath);
			const newPath = pathLib.resolve(root, newRouteDirPath);
			await fs.rename(oldPath, newPath);
			invalidateBranchRouteCache(match.branch);
		} catch (err: unknown) {
			const e = err as { response?: { status?: number; data?: { message?: string } } };
			return fail(e.response?.status ?? 500, {
				renameError: e.response?.data?.message ?? 'Rename failed.',
				newName
			});
		}
	} else {
		// GitHub mode: use API
		const { getOctokit, getRepo } = await import('../server/github.ts');
		const octokit = getOctokit();
		const repo = getRepo();

		let treeItems: Array<{ path?: string; type?: string; sha?: string }>;
		try {
			const { data: tree } = await octokit.request('GET /repos/{owner}/{repo}/git/trees/{tree_sha}', {
				owner: repo.owner,
				repo: repo.name,
				tree_sha: match.branch,
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
				ref: `heads/${match.branch}`
			});
			const { data: commit } = await octokit.request(
				'GET /repos/{owner}/{repo}/git/commits/{commit_sha}',
				{ owner: repo.owner, repo: repo.name, commit_sha: ref.object.sha }
			);
			const { data: tree } = await octokit.request('GET /repos/{owner}/{repo}/git/trees/{tree_sha}', {
				owner: repo.owner,
				repo: repo.name,
				tree_sha: commit.tree.sha,
				recursive: '1'
			});
			treeItems = tree.tree ?? [];
		}

		const blobs = treeItems
			.filter((item) => item.type === 'blob' && item.path && item.sha)
			.map((item) => ({ path: item.path as string, sha: item.sha as string }));

		const prefix = `${routeDirPath}/`;
		const blobsToMove = blobs.filter((blob) => blob.path.startsWith(prefix));

		if (blobsToMove.length === 0) {
			return fail(404, { renameError: 'Nothing to rename.', newName });
		}

		const treeItems2 = [
			...blobsToMove.map(({ path, sha }) => ({
				path: path.replace(prefix, `${newRouteDirPath}/`),
				mode: '100644' as const,
				type: 'blob' as const,
				sha
			})),
			...blobsToMove.map(({ path }) => ({
				path,
				mode: '100644' as const,
				type: 'blob' as const,
				sha: null
			}))
		];

		if (treeItems2.length > 0) {
			const { data: ref } = await octokit.request('GET /repos/{owner}/{repo}/git/ref/{ref}', {
				owner: repo.owner,
				repo: repo.name,
				ref: `heads/${match.branch}`
			});
			const commitSha = ref.object.sha;

			const { data: commit } = await octokit.request(
				'GET /repos/{owner}/{repo}/git/commits/{commit_sha}',
				{ owner: repo.owner, repo: repo.name, commit_sha: commitSha }
			);

			const { data: newTree } = await octokit.request('POST /repos/{owner}/{repo}/git/trees', {
				owner: repo.owner,
				repo: repo.name,
				base_tree: commit.tree.sha,
				tree: treeItems2
			});

			const label = routeDirPath.split('/').pop() ?? routeDirPath;
			const { data: newCommit } = await octokit.request('POST /repos/{owner}/{repo}/git/commits', {
				owner: repo.owner,
				repo: repo.name,
				message: `Rename ${label}`,
				tree: newTree.sha,
				parents: [commitSha]
			});

			await octokit.request('PATCH /repos/{owner}/{repo}/git/refs/{ref}', {
				owner: repo.owner,
				repo: repo.name,
				ref: `heads/${match.branch}`,
				sha: newCommit.sha
			});
		}

		invalidateBranchRouteCache(match.branch);
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

	const mediaDir = normalizeRepoPath(getConfig().mediaDir) ?? '';
	if (!itemPath) {
		return fail(400, { deleteError: 'Item path is required.' });
	}
	if (mediaDir && !isWithinRepoRoot(itemPath, mediaDir)) {
		return fail(403, { deleteError: 'Access denied.' });
	}

	const store = getContentStore();
	try {
		await store.deleteFile(itemPath);
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

	const store = getContentStore();

	// In local mode, publish is a no-op
	if (store.isLocal) {
		return { publishSuccess: true };
	}

	const { aheadBy } = await getBranchStatus(store.branch, defaultBranchForConfig());
	if (aheadBy === 0) throw redirect(302, '/admin/routes');

	const result = await store.publish();
	if (!result.success) {
		return fail(500, { publishError: result.error ?? 'Publish failed.' });
	}

	invalidateBranchRouteCache(store.branch);
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