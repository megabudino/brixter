import { describe, expect, it } from 'vitest';
import { buildSitemapIndexXml, buildSitemapXml } from './xml.js';

describe('buildSitemapXml', () => {
	it('renders a urlset with all fields', () => {
		const xml = buildSitemapXml([
			{ loc: 'https://x.com/a', lastmod: '2026-01-01', changefreq: 'weekly', priority: 0.8 }
		]);
		expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
		expect(xml).toContain('<loc>https://x.com/a</loc>');
		expect(xml).toContain('<lastmod>2026-01-01</lastmod>');
		expect(xml).toContain('<changefreq>weekly</changefreq>');
		expect(xml).toContain('<priority>0.8</priority>');
	});

	it('escapes special characters in loc', () => {
		const xml = buildSitemapXml([{ loc: 'https://x.com/a?b=1&c=2' }]);
		expect(xml).toContain('<loc>https://x.com/a?b=1&amp;c=2</loc>');
	});

	it('clamps priority to [0,1]', () => {
		const xml = buildSitemapXml([
			{ loc: 'https://x.com/hi', priority: 5 },
			{ loc: 'https://x.com/lo', priority: -3 }
		]);
		expect(xml).toContain('<priority>1</priority>');
		expect(xml).toContain('<priority>0</priority>');
	});

	it('dedupes by loc and sorts lexicographically', () => {
		const xml = buildSitemapXml([
			{ loc: 'https://x.com/b' },
			{ loc: 'https://x.com/a' },
			{ loc: 'https://x.com/b' }
		]);
		expect(xml.indexOf('/a')).toBeLessThan(xml.indexOf('/b'));
		expect(xml.match(/https:\/\/x\.com\/b/g)?.length).toBe(1);
	});

	it('handles an empty set', () => {
		const xml = buildSitemapXml([]);
		expect(xml).toContain('<urlset');
		expect(xml).toContain('</urlset>');
		expect(xml).not.toContain('<url>');
	});
});

describe('buildSitemapIndexXml', () => {
	it('renders a sitemapindex', () => {
		const xml = buildSitemapIndexXml([{ loc: 'https://x.com/sitemap-1.xml', lastmod: '2026-01-01' }]);
		expect(xml).toContain('<sitemapindex');
		expect(xml).toContain('<sitemap>');
		expect(xml).toContain('<loc>https://x.com/sitemap-1.xml</loc>');
		expect(xml).toContain('<lastmod>2026-01-01</lastmod>');
	});
});
