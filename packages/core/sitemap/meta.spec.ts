import { describe, expect, it } from 'vitest';
import { extractSitemapMeta } from './meta.js';

describe('extractSitemapMeta', () => {
	it('defaults to included with no directives', () => {
		expect(extractSitemapMeta({ metadata: { title: 'Home' } })).toEqual({ exclude: false });
		expect(extractSitemapMeta(undefined)).toEqual({ exclude: false });
		expect(extractSitemapMeta(null)).toEqual({ exclude: false });
	});

	it('excludes robots noindex variants, read from `metadata`', () => {
		const robots = (value: string) => extractSitemapMeta({ metadata: { robots: value } }).exclude;

		expect(robots('noindex')).toBe(true);
		expect(robots('noindex,nofollow')).toBe(true);
		expect(robots('NOINDEX')).toBe(true);
		expect(robots('index,follow')).toBe(false);
		expect(robots('nofollow')).toBe(false);
	});

	it('ignores a top-level `robots` — it is a `<head>` tag and belongs to metadata', () => {
		expect(extractSitemapMeta({ robots: 'noindex' }).exclude).toBe(false);
	});

	it('excludes on sitemap: false', () => {
		expect(extractSitemapMeta({ sitemap: false }).exclude).toBe(true);
	});

	it('maps sitemap object overrides', () => {
		expect(
			extractSitemapMeta({
				sitemap: { changefreq: 'weekly', priority: 0.8, lastmod: '2026-01-01', loc: '/custom' }
			})
		).toEqual({
			exclude: false,
			changefreq: 'weekly',
			priority: 0.8,
			lastmod: '2026-01-01',
			loc: '/custom'
		});
	});

	it('ignores invalid changefreq and non-numeric priority', () => {
		const meta = extractSitemapMeta({ sitemap: { changefreq: 'often', priority: '0.5' } });
		expect(meta.changefreq).toBeUndefined();
		expect(meta.priority).toBeUndefined();
	});
});
