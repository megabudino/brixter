import { describe, expect, it } from 'vitest';
import { joinOrigin, routeFileToUrl, xmlEscape } from './url.js';

describe('routeFileToUrl', () => {
	const cases: Array<[string, string | null]> = [
		// root + nested pages, both page kinds
		['+page.md', '/'],
		['+page.svelte', '/'],
		['test/+page.md', '/test'],
		['blog/posts/+page.svelte', '/blog/posts'],
		['about/+page.md', '/about'],
		['docs/+page.svx', '/docs'],
		['+page.md', '/'],
		// route groups are dropped
		['(marketing)/pricing/+page.md', '/pricing'],
		['(a)/(b)/x/+page.svelte', '/x'],
		['(marketing)/+page.svelte', '/'],
		// layout-reset suffix does not affect the URL
		['about/+page@.svelte', '/about'],
		['about/+page@reset.svelte', '/about'],
		['dash/+page@(app).md', '/dash'],
		// dynamic segments are not statically enumerable
		['blog/[slug]/+page.svelte', null],
		['[...rest]/+page.svelte', null],
		['docs/[[optional]]/+page.svelte', null],
		['items/[id=integer]/+page.svelte', null],
		// non-page files
		['+server.ts', null],
		['+layout.svelte', null],
		['+error.svelte', null],
		['contact/+page.server.ts', null],
		// non-ASCII literals are percent-encoded
		['café/+page.svelte', '/caf%C3%A9'],
		['a b/+page.svelte', '/a%20b']
	];

	for (const [input, expected] of cases) {
		it(`${input} → ${expected}`, () => {
			expect(routeFileToUrl(input)).toBe(expected);
		});
	}

	it('honors a leading slash on the input', () => {
		expect(routeFileToUrl('/test/+page.md')).toBe('/test');
	});

	it('appends a trailing slash when configured (root stays /)', () => {
		expect(routeFileToUrl('test/+page.svelte', { trailingSlash: 'always' })).toBe('/test/');
		expect(routeFileToUrl('+page.svelte', { trailingSlash: 'always' })).toBe('/');
	});
});

describe('joinOrigin', () => {
	it('joins without doubling slashes', () => {
		expect(joinOrigin('https://x.com', '/a')).toBe('https://x.com/a');
		expect(joinOrigin('https://x.com/', '/a')).toBe('https://x.com/a');
		expect(joinOrigin('https://x.com', 'a')).toBe('https://x.com/a');
		expect(joinOrigin('https://x.com/', '/')).toBe('https://x.com/');
	});
});

describe('xmlEscape', () => {
	it('escapes the five predefined entities', () => {
		expect(xmlEscape(`a&b<c>d"e'f`)).toBe('a&amp;b&lt;c&gt;d&quot;e&apos;f');
	});
});
