import { describe, expect, it } from 'vitest';
import { extractAliases, pageAliasSource } from './aliases.js';

describe('extractAliases', () => {
	it('reads a list of paths', () => {
		expect(extractAliases({ aliases: ['/a', '/b'] })).toEqual([{ path: '/a' }, { path: '/b' }]);
	});

	it('reads a single path written without a list', () => {
		expect(extractAliases({ aliases: '/a' })).toEqual([{ path: '/a' }]);
	});

	it('reads the long form, with `path` or `from`', () => {
		expect(extractAliases({ aliases: [{ path: '/a', status: 302 }, { from: '/b' }] })).toEqual([
			{ path: '/a', status: 302 },
			{ path: '/b', status: undefined }
		]);
	});

	it('returns nothing for metadata without aliases', () => {
		expect(extractAliases({ title: 'Pricing' })).toEqual([]);
		expect(extractAliases({ aliases: null })).toEqual([]);
		expect(extractAliases(null)).toEqual([]);
		expect(extractAliases('nope')).toEqual([]);
	});

	it('keeps an unusable entry so the compiler can report it', () => {
		expect(extractAliases({ aliases: [42] })).toEqual([{ path: 42 }]);
	});
});

describe('pageAliasSource', () => {
	const pages = [
		{
			file: 'src/routes/pricing/+page.md',
			url: '/pricing',
			frontmatter: { aliases: ['/plans', { path: '/old-pricing', status: 302 }] }
		},
		{ file: 'src/routes/about/+page.md', url: '/about', frontmatter: { title: 'About' } }
	];

	it('turns each alias into a rule pointing at its page, tagged with the page file', () => {
		expect(pageAliasSource(pages)).toEqual({
			name: 'page aliases',
			rules: [
				{ from: '/plans', to: '/pricing', file: 'src/routes/pricing/+page.md' },
				{
					from: '/old-pricing',
					to: '/pricing',
					status: 302,
					file: 'src/routes/pricing/+page.md'
				}
			]
		});
	});

	it('takes a name, so a second source is distinguishable in diagnostics', () => {
		expect(pageAliasSource([], 'redirects.yaml').name).toBe('redirects.yaml');
	});
});
