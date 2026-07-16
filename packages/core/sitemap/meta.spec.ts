import { describe, expect, it } from 'vitest';
import { extractSitemapMeta } from './meta.js';

describe('extractSitemapMeta', () => {
	it('defaults to included with no directives', () => {
		expect(extractSitemapMeta({ title: 'Home' })).toEqual({ exclude: false });
		expect(extractSitemapMeta(undefined)).toEqual({ exclude: false });
		expect(extractSitemapMeta(null)).toEqual({ exclude: false });
	});

	it('excludes robots noindex variants', () => {
		expect(extractSitemapMeta({ robots: 'noindex' }).exclude).toBe(true);
		expect(extractSitemapMeta({ robots: 'noindex,nofollow' }).exclude).toBe(true);
		expect(extractSitemapMeta({ robots: 'NOINDEX' }).exclude).toBe(true);
		expect(extractSitemapMeta({ robots: 'index,follow' }).exclude).toBe(false);
		expect(extractSitemapMeta({ robots: 'nofollow' }).exclude).toBe(false);
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
