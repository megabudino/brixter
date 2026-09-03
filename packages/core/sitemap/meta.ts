/**
 * Extract sitemap directives from a page's metadata object.
 *
 * The page compiler exposes the parsed frontmatter as the
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

export function extractSitemapMeta(frontmatter: unknown): SitemapMeta {
	const result: SitemapMeta = { exclude: false };
	if (!isRecord(frontmatter)) return result;

	// `robots: noindex` (or `noindex,nofollow`) drops the page from the sitemap.
	// It is a `<head>` tag, so it lives under `metadata`; `sitemap` is a build
	// directive and sits at the top level beside `brix` and `layout`.
	const metadata = frontmatter.metadata;
	const robots = isRecord(metadata) ? metadata.robots : undefined;
	if (typeof robots === 'string' && /\bnoindex\b/i.test(robots)) {
		result.exclude = true;
	}

	const sitemap = frontmatter.sitemap;
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
