import { describe, expect, it } from 'vitest';
import { routeIdToPattern } from './routes.js';

describe('routeIdToPattern', () => {
	const cases: Array<[id: string, matches: string[], misses: string[]]> = [
		['/', ['/'], ['/a']],
		['/pricing', ['/pricing', '/pricing/'], ['/pricing/x', '/pricin', '/xpricing']],
		['/(marketing)/pricing', ['/pricing'], ['/marketing/pricing']],
		['/blog/[slug]', ['/blog/hello', '/blog/hello/'], ['/blog', '/blog/a/b']],
		['/items/[id=integer]', ['/items/12'], ['/items']],
		['/docs/[[version]]', ['/docs', '/docs/v2'], ['/docs/v2/intro']],
		['/[...rest]', ['/', '/a', '/a/b/c'], []],
		['/files/[...path]', ['/files', '/files/a/b'], ['/other']],
		// literal text either side of a param stays anchored to its segment
		['/posts/[slug].json', ['/posts/hello.json'], ['/posts/hello.xml', '/posts/a/b.json']]
	];

	for (const [id, matches, misses] of cases) {
		it(`matches the paths ${id} serves`, () => {
			const pattern = routeIdToPattern(id);
			for (const path of matches) expect([id, path, pattern.test(path)]).toEqual([id, path, true]);
			for (const path of misses) expect([id, path, pattern.test(path)]).toEqual([id, path, false]);
		});
	}

	it('escapes regex metacharacters in literal segments', () => {
		const pattern = routeIdToPattern('/a.b');
		expect(pattern.test('/a.b')).toBe(true);
		expect(pattern.test('/axb')).toBe(false);
	});
});
