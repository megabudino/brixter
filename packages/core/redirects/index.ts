/**
 * `@brixter/core/redirects` — framework-agnostic redirect building blocks.
 *
 * A page that replaced an old URL declares that URL in its `aliases`. This
 * module turns those declarations — and any other source of rules added later —
 * into one flat, deterministically ordered map, refusing anything inconsistent,
 * and serializes it into the hosting layers' native formats.
 *
 * The SvelteKit side (route manifest, content-tree scan, adapter detection)
 * lives in the `brixter` package and composes these.
 */
export * from './types.js';
export { isExternalDestination, normalizeDestination, normalizeRedirectPath } from './path.js';
export { routeIdToPattern } from './routes.js';
export { extractAliases, pageAliasSource, type AliasPage, type DeclaredAlias } from './aliases.js';
export { analyzeRedirects, compileRedirects, RedirectCompileError } from './compile.js';
export {
	formatRedirectsFile,
	mergeRedirectsFile,
	toVercelRoutes,
	REDIRECTS_BANNER,
	REDIRECTS_BANNER_END,
	type VercelRoute
} from './emit.js';
