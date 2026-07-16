/**
 * Extract sitemap directives from a page's metadata object.
 *
 * The `.brix.yaml` compiler exposes every non-`components`/`layout` key as the
 * page's exported `metadata`, so `robots` and an optional `sitemap` key arrive
 * here unchanged. This reader is deliberately a plain-object mapper (not the
 * full `parseBrixYamlDocument`, which needs brik definitions and injects
 * title/description defaults we don't want).
 */
import type { ChangeFreq, SitemapMeta } from './types.js';

const CHANGEFREQS: ReadonlySet<string> = new Set<ChangeFreq>([
	'always',
	'hourly',
	'daily',
	'weekly',
	'monthly',
	'yearly',
	'never'
]);

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

export function extractSitemapMeta(metadata: unknown): SitemapMeta {
	const result: SitemapMeta = { exclude: false };
	if (!isRecord(metadata)) return result;

	// `robots: noindex` (or `noindex,nofollow`) drops the page from the sitemap.
	const robots = metadata.robots;
	if (typeof robots === 'string' && /\bnoindex\b/i.test(robots)) {
		result.exclude = true;
	}

	const sitemap = metadata.sitemap;
	if (sitemap === false) {
		result.exclude = true;
		return result;
	}
	if (isRecord(sitemap)) {
		if (typeof sitemap.loc === 'string') result.loc = sitemap.loc;
		if (typeof sitemap.lastmod === 'string') result.lastmod = sitemap.lastmod;
		if (typeof sitemap.changefreq === 'string' && CHANGEFREQS.has(sitemap.changefreq)) {
			result.changefreq = sitemap.changefreq as ChangeFreq;
		}
		if (typeof sitemap.priority === 'number') result.priority = sitemap.priority;
	}

	return result;
}
