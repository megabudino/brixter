/**
 * Framework-agnostic sitemap model.
 *
 * These types (and the pure helpers in this directory) describe a sitemap
 * without any knowledge of SvelteKit, Vite, or the DOM — so a future adapter
 * for a different framework can reuse the same URL model and serializer.
 */

export type ChangeFreq = 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';

/** A single `<url>` entry in a sitemap. `loc` is the absolute URL, pre-escape. */
export interface SitemapEntry {
	loc: string;
	lastmod?: string;
	changefreq?: ChangeFreq;
	priority?: number;
}

export interface RouteUrlOptions {
	/** Whether URLs (other than the root) carry a trailing slash. Defaults to `'never'`. */
	trailingSlash?: 'never' | 'always';
}

/** Normalized per-page sitemap directives extracted from page metadata. */
export interface SitemapMeta {
	/** `true` when the page opts out (`sitemap: false`) or is `robots: noindex`. */
	exclude: boolean;
	changefreq?: ChangeFreq;
	priority?: number;
	lastmod?: string;
	/** Explicit URL override (`sitemap.loc`); wins over the derived route URL. */
	loc?: string;
}
