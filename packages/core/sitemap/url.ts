/**
 * Pure route-path → URL translation and URL helpers.
 *
 * Mirrors SvelteKit's filesystem-routing conventions (route groups, dynamic
 * params, layout-reset suffixes) without importing SvelteKit — the caller
 * hands us a page-file path relative to the routes root and we return the URL
 * pathname, or `null` when the file is not a statically-enumerable page.
 */
import type { RouteUrlOptions } from './types.js';

// The optional `@…` layout-reset suffix may name a segment or a `(group)`, so
// it can contain parentheses — match everything up to the extension dot.
const PAGE_FILE = /^\+page(@[^.]*)?\.(svelte|md|svx)$/;
const PAGE_BRIX_FILE = /^\+page(@[^.]*)?\.brix\.ya?ml$/;
const ROUTE_GROUP = /^\(.+\)$/;

/**
 * Translate a page-file path (relative to the routes root, e.g.
 * `(marketing)/pricing/+page.brix.yaml`) into a URL pathname (`/pricing`).
 *
 * Returns `null` when the path is not a page file, or when any segment is a
 * dynamic route (`[slug]`, `[...rest]`, `[[opt]]`, `[x=matcher]`) — dynamic
 * routes are not statically enumerable and are handled by `additionalPaths`.
 */
export function routeFileToUrl(routesRelPath: string, opts: RouteUrlOptions = {}): string | null {
	const segments = routesRelPath.replace(/\\/g, '/').replace(/^\/+/, '').split('/');
	const file = segments.pop();
	if (!file || (!PAGE_FILE.test(file) && !PAGE_BRIX_FILE.test(file))) return null;

	const urlSegments: string[] = [];
	for (const segment of segments) {
		if (!segment) continue;
		if (ROUTE_GROUP.test(segment)) continue; // route group: contributes no URL segment
		if (segment.includes('[')) return null; // dynamic: deferred to additionalPaths
		urlSegments.push(encodeURIComponent(segment));
	}

	if (urlSegments.length === 0) return '/';
	const path = '/' + urlSegments.join('/');
	return (opts.trailingSlash ?? 'never') === 'always' ? path + '/' : path;
}

/** Join an origin and a path into an absolute URL, avoiding a double slash. */
export function joinOrigin(origin: string, path: string): string {
	const base = origin.replace(/\/+$/, '');
	return base + (path.startsWith('/') ? path : '/' + path);
}

/** Escape the five XML predefined entities for safe inclusion in element text. */
export function xmlEscape(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}
