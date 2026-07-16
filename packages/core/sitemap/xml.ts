/**
 * Sitemap XML serialization (sitemaps.org 0.9 schema). Pure and agnostic.
 */
import type { SitemapEntry } from './types.js';
import { xmlEscape } from './url.js';

const URLSET_NS = 'http://www.sitemaps.org/schemas/sitemap/0.9';

function clampPriority(value: number): number {
	if (Number.isNaN(value)) return 0;
	return Math.min(1, Math.max(0, value));
}

/** Dedupe entries by `loc` (first wins) and sort lexicographically for stable output. */
function normalize(entries: SitemapEntry[]): SitemapEntry[] {
	const seen = new Set<string>();
	const unique: SitemapEntry[] = [];
	for (const entry of entries) {
		if (!entry || !entry.loc || seen.has(entry.loc)) continue;
		seen.add(entry.loc);
		unique.push(entry);
	}
	return unique.sort((a, b) => (a.loc < b.loc ? -1 : a.loc > b.loc ? 1 : 0));
}

export function buildSitemapXml(entries: SitemapEntry[]): string {
	const urls = normalize(entries).map((entry) => {
		const lines = [`\t\t<loc>${xmlEscape(entry.loc)}</loc>`];
		if (entry.lastmod) lines.push(`\t\t<lastmod>${xmlEscape(entry.lastmod)}</lastmod>`);
		if (entry.changefreq) lines.push(`\t\t<changefreq>${entry.changefreq}</changefreq>`);
		if (entry.priority !== undefined) {
			lines.push(`\t\t<priority>${clampPriority(entry.priority)}</priority>`);
		}
		return `\t<url>\n${lines.join('\n')}\n\t</url>`;
	});
	return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="${URLSET_NS}">\n${urls.join('\n')}\n</urlset>\n`;
}

/**
 * Serialize a sitemap index. Seam for splitting >50k-URL sitemaps into chunks;
 * not wired into the endpoint yet.
 */
export function buildSitemapIndexXml(sitemaps: { loc: string; lastmod?: string }[]): string {
	const items = sitemaps.map((sitemap) => {
		const lines = [`\t\t<loc>${xmlEscape(sitemap.loc)}</loc>`];
		if (sitemap.lastmod) lines.push(`\t\t<lastmod>${xmlEscape(sitemap.lastmod)}</lastmod>`);
		return `\t<sitemap>\n${lines.join('\n')}\n\t</sitemap>`;
	});
	return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="${URLSET_NS}">\n${items.join('\n')}\n</sitemapindex>\n`;
}
