import { error, redirect, type RequestEvent } from '@sveltejs/kit';
import { APIError } from '@better-auth/core/error';
import { parseSetCookieHeader, toCookieOptions } from 'better-auth/cookies';
import { getAuth } from '../server/auth.ts';
import { getConfig, getCoreConfigIssues } from '../server/config.ts';
import { isSetupComplete } from '../server/setup.ts';
import { getContentStore, isLocalMode } from '../server/content-store.ts';
import {
	findRouteNode,
	getExplorerListing,
	childDirNames,
	childPageNames,
	childRoute,
	routeBreadcrumbs,
	routeDirUrlPath,
	routePageUrlPath,
	resolveRouteUrlPath,
	isWithinRepoRoot,
	normalizeRepoPath,
	type RouteNode,
	type TreeEntry
} from '../server/sveltekit-routes.ts';

export type DashboardPage =
	| 'login'
	| 'setup'
	| 'config-error'
	| 'accounts'
	| 'branch'
	| 'media'
	| 'publish';

export interface PageMatch {
	page: DashboardPage;
	branch?: string;
	path?: string;
}

export function draftBranch(): string {
	return getContentStore().branch;
}

const LEGACY_DRAFT_BRANCHES = ['drafts'];

export function repoMeta() {
	const config = getConfig().github;
	return {
		name: config.repoName,
		fullName: `${config.repoOwner}/${config.repoName}`
	};
}

export function defaultBranchForConfig(): string {
	return getConfig().github.defaultBranch;
}

function decodePathPart(value: string | undefined): string {
	return decodeURIComponent(value ?? '');
}

export const AUTH_ERROR_MESSAGES: Record<string, string> = {
	INVALID_EMAIL_OR_PASSWORD: 'Incorrect email or password.',
	EMAIL_NOT_VERIFIED:
		'Your email is not verified yet. Check your inbox for a verification link, or ask an admin for help.',
	FAILED_TO_CREATE_SESSION: 'We could not start a session. Please try again.',
	EMAIL_PASSWORD_DISABLED: 'Email sign-in is not enabled on this server.',
	INVALID_ORIGIN:
		'This sign-in request was blocked because the site origin does not match server configuration. Set ORIGIN to the exact URL in your browser (scheme, host, and port).',
	INVALID_EMAIL: 'Enter a valid email address.'
};

export function formatAuthErrorMessage(error: APIError, fallback: string): string {
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

export function getActionErrorMessage(
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

export function dashboardPath(pathname: string): string {
	if (pathname === '/admin') return '';
	if (pathname.startsWith('/admin/')) return pathname.slice('/admin/'.length);
	if (pathname === '/__brixter') return '';
	if (pathname.startsWith('/__brixter/')) return pathname.slice('/__brixter/'.length);
	return '';
}

export function matchPage(pathname: string): PageMatch {
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

export function parentPathFor(path: string, routeTree: RouteNode): string | null {
	if (path === routeTree.dirPath) return null;
	const parent = path.split('/').slice(0, -1).join('/');
	return parent && findRouteNode(routeTree, parent)
		? routeDirUrlPath(routeTree.dirPath, parent)
		: null;
}

export function parentPathForPage(path: string, routeTree: RouteNode): string | null {
	const routeDir = path.split('/').slice(0, -1).join('/');
	const routeNode = findRouteNode(routeTree, routeDir);
	if (!routeNode) return parentPathFor(path, routeTree);

	if (routeNode.children.length === 0) return parentPathFor(routeDir, routeTree);
	return routeDirUrlPath(routeTree.dirPath, routeDir);
}

export function validateDirectoryName(name: string): string | null {
	if (!name) return 'Directory name is required.';
	if (name === '.' || name === '..') return 'Directory name is reserved.';
	if (name.includes('/') || name.includes('\\')) return 'Directory name cannot contain slashes.';
	if (name.startsWith('+')) return 'Directory name cannot start with "+".';
	return null;
}

export function titleFromRouteName(name: string): string {
	return name
		.split(/[-_\s]+/)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(' ');
}

export function isBrixYamlFile(path: string): boolean {
	return /\.brix\.ya?ml$/i.test(path);
}

export function encodeRouteSegment(segment: string): string {
	return segment === '+page' ? segment : encodeURIComponent(segment);
}

export function routesHref(path = ''): string {
	const base = '/admin/routes';
	if (!path) return base;
	return `${base}/${path.split('/').map(encodeRouteSegment).join('/')}`;
}

export async function ensureDraftBranch(): Promise<void> {
	const store = getContentStore();
	await store.ensureDraftBranch();
}

export async function syncDraftWithDefaultBranch(defaultBranch: string): Promise<{
	behindBy: number;
	aheadBy: number;
	syncError?: string;
}> {
	const store = getContentStore();
	return store.syncWithDefault();
}

export function applySetCookieHeaders(headers: Headers, cookies: RequestEvent['cookies']) {
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