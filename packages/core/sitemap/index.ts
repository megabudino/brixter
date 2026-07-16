/**
 * `@brixter/core/sitemap` — framework-agnostic sitemap building blocks.
 *
 * Pure URL translation, per-page directive extraction, and XML serialization,
 * depending only on the standard library. The SvelteKit adapter (route
 * discovery + endpoint) lives in the `brixter` package and composes these.
 */
export * from './types.js';
export { routeFileToUrl, joinOrigin, xmlEscape } from './url.js';
export { extractSitemapMeta } from './meta.js';
export { buildSitemapXml, buildSitemapIndexXml } from './xml.js';
