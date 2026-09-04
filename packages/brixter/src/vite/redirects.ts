/**
 * Dev-server side of the redirect system.
 *
 * In production the hosting layer answers aliases; there is no hosting layer in
 * `vite dev`, so the dev server answers them itself — with the same status code
 * the edge would send, from the same compiled map. Without this an alias would
 * 404 locally and only appear to work once deployed.
 *
 * Inconsistencies are reported here as warnings rather than thrown: the build
 * is where they stop the world (see `brixter/sveltekit/redirects`), and a
 * half-written alias shouldn't take the dev server down mid-edit.
 */
import path from 'node:path';
import {
	analyzeRedirects,
	normalizeRedirectPath,
	pageAliasSource,
	type RedirectSource,
	type RedirectStatus
} from '@brixter/core/redirects';
import { scanBrixPages, scanRoutes, scanStaticAssets } from '../sveltekit/redirects/scan.ts';

export interface DevRedirectsOptions {
	/** Routes directory, relative to the Vite root. Defaults to `src/routes`. */
	routesDir?: string;
	/** Static assets directory, relative to the Vite root. Defaults to `static`. */
	assetsDir?: string;
	/** Additional rule sources beyond page `aliases` — mirror what the adapter gets. */
	sources?: RedirectSource[] | (() => RedirectSource[]);
	trailingSlash?: 'never' | 'always';
	defaultStatus?: RedirectStatus;
	/** Set `false` to leave aliases unserved in dev. Defaults to `true`. */
	enabled?: boolean;
}

export interface CompiledDevRedirects {
	/** Normalized alias → where to send it, and with what status. */
	map: Map<string, { to: string; status: number }>;
	warnings: string[];
}

/** Compile the site's redirects from the filesystem alone, without failing. */
export function compileDevRedirects(
	root: string,
	options: DevRedirectsOptions = {}
): CompiledDevRedirects {
	const routesDir = path.resolve(root, options.routesDir ?? 'src/routes');
	const assetsDir = path.resolve(root, options.assetsDir ?? 'static');

	const pages = scanBrixPages(routesDir, root).map((page) => ({
		file: page.file,
		url: page.url ?? page.routeId,
		frontmatter: page.frontmatter
	}));
	const extra = typeof options.sources === 'function' ? options.sources() : options.sources;

	const { redirects, issues } = analyzeRedirects({
		sources: [pageAliasSource(pages), ...(extra ?? [])],
		// No framework manifest in dev: the layout of the routes directory is the
		// best available approximation of one.
		routes: scanRoutes(routesDir),
		knownPaths: scanStaticAssets(assetsDir),
		trailingSlash: options.trailingSlash,
		defaultStatus: options.defaultStatus
	});

	const map = new Map(redirects.map((rule) => [rule.from, { to: rule.to, status: rule.status }]));
	return { map, warnings: issues.map((issue) => issue.message) };
}

/** Look a request path up in a compiled map, preserving the query string. */
export function resolveDevRedirect(
	compiled: CompiledDevRedirects,
	url: string,
	trailingSlash?: 'never' | 'always'
): { location: string; status: number } | null {
	const queryAt = url.search(/[?#]/);
	const pathname = queryAt === -1 ? url : url.slice(0, queryAt);
	const suffix = queryAt === -1 ? '' : url.slice(queryAt);

	const normalized = normalizeRedirectPath(pathname, { trailingSlash });
	if (!normalized.ok) return null;

	const rule = compiled.map.get(normalized.path);
	if (!rule) return null;
	// A query string belongs to the request, not the rule: carry it across, as
	// every hosting layer we emit to does.
	return { location: rule.to + (rule.to.includes('?') ? '' : suffix), status: rule.status };
}
