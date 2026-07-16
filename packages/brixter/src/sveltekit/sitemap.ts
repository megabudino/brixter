/// <reference types="vite/client" />
/**
 * SvelteKit sitemap endpoint for brixter.
 *
 * Auto-discovers every page under the consumer's `src/routes` via
 * `import.meta.glob` (expanded by Vite against the app root at build time),
 * translates each to a URL with `@brixter/core/sitemap`, honors per-page
 * `robots`/`sitemap` directives, and serves a `sitemap.xml`.
 *
 * Plug-and-play: `src/routes/sitemap.xml/+server.ts` →
 *   `export { GET, prerender } from 'brixter/sveltekit/sitemap';`
 *
 * Advanced (dynamic routes, explicit origin):
 *   `export const { GET, prerender } = createSitemap({ siteUrl, additionalPaths });`
 */
import type { RequestHandler } from '@sveltejs/kit';
import {
	buildSitemapXml,
	extractSitemapMeta,
	joinOrigin,
	routeFileToUrl,
	type ChangeFreq,
	type SitemapEntry
} from '@brixter/core/sitemap';

export interface SitemapOptions {
	/**
	 * Absolute origin (e.g. `https://example.com`) used to build `<loc>` URLs.
	 * REQUIRED for correct prerendered output — under prerender SvelteKit's
	 * `url.origin` is a synthetic internal value. When omitted, the request
	 * origin is used (correct for SSR only). To drive it from an env file, read
	 * it in your own `+server.ts` (`$env/static/public`) and pass it here.
	 */
	siteUrl?: string;
	/** Trailing-slash policy for discovered URLs. Defaults to `'never'`. */
	trailingSlash?: 'never' | 'always';
	/** Defaults applied to every entry unless overridden per-page. */
	defaults?: { changefreq?: ChangeFreq; priority?: number };
	/**
	 * Extra URLs to include — e.g. dynamic `[slug]` routes fed from your data.
	 * Strings are treated as paths (root-relative → absolutized); objects pass
	 * through. Sync or async.
	 */
	additionalPaths?: () => Array<string | SitemapEntry> | Promise<Array<string | SitemapEntry>>;
	/** Drop entries for which this returns `false`. */
	filter?: (entry: SitemapEntry) => boolean;
	/** Rewrite (or drop, by returning `null`) each entry before serialization. */
	transform?: (entry: SitemapEntry) => SitemapEntry | null;
	/** Prerender the sitemap at build time. Defaults to `true`. */
	prerender?: boolean;
}

const ROUTES_PREFIX = '/src/routes/';

interface DiscoveredPage {
	path: string;
	metadata: unknown;
}

/**
 * Enumerate page files under the consumer's `src/routes`. Brixter pages are
 * globbed eagerly for their compiled `metadata` export (single source of truth
 * with `<BrixSeo>`); plain/mdsvex pages contribute their path only. `+page@*`
 * layout-reset variants need their own patterns — they don't match `+page.*`.
 */
function discoverPages(): DiscoveredPage[] {
	const brix = import.meta.glob('/src/routes/**/+page.brix.{yaml,yml}', {
		eager: true,
		import: 'metadata'
	});
	const brixReset = import.meta.glob('/src/routes/**/+page@*.brix.{yaml,yml}', {
		eager: true,
		import: 'metadata'
	});
	const plain = import.meta.glob('/src/routes/**/+page.{svelte,md,svx}');
	const reset = import.meta.glob('/src/routes/**/+page@*.{svelte,md,svx}');

	const pages: DiscoveredPage[] = [];
	for (const [path, metadata] of Object.entries({ ...brix, ...brixReset })) {
		pages.push({ path, metadata });
	}
	for (const path of [...Object.keys(plain), ...Object.keys(reset)]) {
		pages.push({ path, metadata: null });
	}
	return pages;
}

function resolveOrigin(options: SitemapOptions, requestOrigin: string): { origin: string; explicit: boolean } {
	if (options.siteUrl) return { origin: options.siteUrl.replace(/\/+$/, ''), explicit: true };
	return { origin: requestOrigin.replace(/\/+$/, ''), explicit: false };
}

function absolutize(loc: string, origin: string): string {
	if (/^https?:\/\//i.test(loc)) return loc;
	return joinOrigin(origin, loc);
}

export function createSitemap(options: SitemapOptions = {}): {
	GET: RequestHandler;
	prerender: boolean;
} {
	const prerender = options.prerender ?? true;

	const GET: RequestHandler = async ({ url }) => {
		const { origin, explicit } = resolveOrigin(options, url.origin);
		if (prerender && !explicit) {
			console.warn(
				'[brixter] sitemap: no `siteUrl` configured; prerendered <loc> values will use a ' +
					'synthetic origin. Pass `siteUrl` to createSitemap() for correct absolute URLs.'
			);
		}

		const entries: SitemapEntry[] = [];
		for (const page of discoverPages()) {
			const rel = page.path.startsWith(ROUTES_PREFIX)
				? page.path.slice(ROUTES_PREFIX.length)
				: page.path;
			const path = routeFileToUrl(rel, { trailingSlash: options.trailingSlash });
			if (path === null) continue;

			const meta = extractSitemapMeta(page.metadata);
			if (meta.exclude) continue;

			const entry: SitemapEntry = {
				loc: meta.loc ? absolutize(meta.loc, origin) : joinOrigin(origin, path)
			};
			if (meta.lastmod) entry.lastmod = meta.lastmod;
			const changefreq = meta.changefreq ?? options.defaults?.changefreq;
			if (changefreq) entry.changefreq = changefreq;
			const priority = meta.priority ?? options.defaults?.priority;
			if (priority !== undefined) entry.priority = priority;
			entries.push(entry);
		}

		if (options.additionalPaths) {
			for (const item of await options.additionalPaths()) {
				if (typeof item === 'string') {
					entries.push({ loc: absolutize(item, origin) });
				} else if (item && item.loc) {
					entries.push({ ...item, loc: absolutize(item.loc, origin) });
				}
			}
		}

		let result = options.filter ? entries.filter(options.filter) : entries;
		if (options.transform) {
			const transform = options.transform;
			result = result.reduce<SitemapEntry[]>((acc, entry) => {
				const next = transform(entry);
				if (next) acc.push(next);
				return acc;
			}, []);
		}

		return new Response(buildSitemapXml(result), {
			headers: {
				'content-type': 'application/xml',
				'cache-control': 'max-age=0, s-maxage=3600'
			}
		});
	};

	return { GET, prerender };
}

const defaultSitemap = createSitemap();

/** Zero-config sitemap handler. Re-export from `sitemap.xml/+server.ts`. */
export const GET: RequestHandler = defaultSitemap.GET;
export const prerender = true;
