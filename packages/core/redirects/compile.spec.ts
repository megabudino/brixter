import { describe, expect, it } from 'vitest';
import { analyzeRedirects, compileRedirects, RedirectCompileError } from './compile.js';
import { routeIdToPattern } from './routes.js';
import type { KnownRoute, RedirectSource } from './types.js';

const routes = (...ids: string[]): KnownRoute[] =>
	ids.map((id) => ({ id, pattern: routeIdToPattern(id) }));

const source = (
	rules: Array<[from: string, to: string, file?: string, status?: number]>,
	name = 'page aliases'
): RedirectSource => ({
	name,
	rules: rules.map(([from, to, file = 'src/routes/x/+page.brix.yaml', status]) => ({
		from,
		to,
		file,
		...(status === undefined ? {} : { status })
	}))
});

describe('compileRedirects', () => {
	it('compiles a page alias into a 301 by default', () => {
		const result = compileRedirects({
			sources: [source([['/old-pricing', '/pricing']])],
			routes: routes('/pricing')
		});
		expect(result).toEqual([
			{
				from: '/old-pricing',
				to: '/pricing',
				status: 301,
				file: 'src/routes/x/+page.brix.yaml',
				source: 'page aliases',
				via: []
			}
		]);
	});

	it('normalizes both sides of a rule', () => {
		const result = compileRedirects({
			sources: [source([['old-pricing/', '//pricing/']])],
			routes: routes('/pricing')
		});
		expect(result[0].from).toBe('/old-pricing');
		expect(result[0].to).toBe('/pricing');
	});

	it('applies a trailing-slash policy uniformly', () => {
		const result = compileRedirects({
			sources: [source([['/old', '/pricing']])],
			routes: routes('/pricing'),
			trailingSlash: 'always'
		});
		expect(result[0]).toMatchObject({ from: '/old/', to: '/pricing/' });
	});

	it('honors a per-rule status and a configured default', () => {
		const result = compileRedirects({
			sources: [
				source([
					['/a', '/pricing', 'a.yaml', 302],
					['/b', '/pricing', 'b.yaml']
				])
			],
			routes: routes('/pricing'),
			defaultStatus: 308
		});
		expect(result.map((rule) => rule.status)).toEqual([302, 308]);
	});

	it('orders the map deterministically regardless of source order', () => {
		const paths: Array<[string, string]> = [
			['/zeta', '/pricing'],
			['/alpha', '/pricing'],
			['/mid', '/pricing']
		];
		const forward = compileRedirects({ sources: [source(paths)], routes: routes('/pricing') });
		const backward = compileRedirects({
			sources: [source([...paths].reverse())],
			routes: routes('/pricing')
		});
		expect(forward.map((rule) => rule.from)).toEqual(['/alpha', '/mid', '/zeta']);
		expect(backward).toEqual(forward);
	});

	it('accepts a destination served by a dynamic route', () => {
		const result = compileRedirects({
			sources: [source([['/old-post', '/blog/hello']])],
			routes: routes('/blog/[slug]')
		});
		expect(result[0].to).toBe('/blog/hello');
	});

	it('accepts a destination that is a known path (prerendered or static asset)', () => {
		const result = compileRedirects({
			sources: [source([['/paper', '/files/whitepaper.pdf']])],
			knownPaths: ['/files/whitepaper.pdf']
		});
		expect(result[0].to).toBe('/files/whitepaper.pdf');
	});

	it('passes an external destination through without resolving it', () => {
		const result = compileRedirects({
			sources: [source([['/discord', 'https://discord.gg/abc']])]
		});
		expect(result[0].to).toBe('https://discord.gg/abc');
	});

	describe('sources', () => {
		it('merges several sources into one map', () => {
			const result = compileRedirects({
				sources: [
					source([['/old-pricing', '/pricing']]),
					source([['/legacy', 'https://elsewhere.test']], 'redirects.yaml')
				],
				routes: routes('/pricing')
			});
			expect(result.map((rule) => [rule.from, rule.source])).toEqual([
				['/legacy', 'redirects.yaml'],
				['/old-pricing', 'page aliases']
			]);
		});

		it('lets one source resolve through an alias declared by another', () => {
			const result = compileRedirects({
				sources: [
					source([['/b', '/pricing', 'page.yaml']]),
					source([['/a', '/b', 'redirects.yaml']], 'redirects.yaml')
				],
				routes: routes('/pricing')
			});
			expect(result.find((rule) => rule.from === '/a')).toMatchObject({
				to: '/pricing',
				via: ['/b']
			});
		});

		it('compiles nothing from no sources', () => {
			expect(compileRedirects({ sources: [] })).toEqual([]);
		});
	});

	describe('chain flattening', () => {
		it('collapses a chain to a single hop, keeping each rule its own status', () => {
			const result = compileRedirects({
				sources: [
					source([
						['/a', '/b', 'a.yaml', 302],
						['/b', '/c', 'b.yaml'],
						['/c', '/pricing', 'c.yaml']
					])
				],
				routes: routes('/pricing')
			});
			expect(result).toEqual([
				{
					from: '/a',
					to: '/pricing',
					status: 302,
					file: 'a.yaml',
					source: 'page aliases',
					via: ['/b', '/c']
				},
				{
					from: '/b',
					to: '/pricing',
					status: 301,
					file: 'b.yaml',
					source: 'page aliases',
					via: ['/c']
				},
				{ from: '/c', to: '/pricing', status: 301, file: 'c.yaml', source: 'page aliases', via: [] }
			]);
		});

		it('flattens a chain that ends outside the site', () => {
			const result = compileRedirects({
				sources: [
					source([
						['/a', '/b', 'a.yaml'],
						['/b', 'https://elsewhere.test/x', 'b.yaml']
					])
				]
			});
			expect(result.find((rule) => rule.from === '/a')).toMatchObject({
				to: 'https://elsewhere.test/x',
				via: ['/b']
			});
		});
	});
});

describe('compileRedirects — inconsistencies break the build', () => {
	const failsWith = (input: Parameters<typeof compileRedirects>[0]) => {
		try {
			compileRedirects(input);
		} catch (error) {
			return error as RedirectCompileError;
		}
		throw new Error('expected compileRedirects to throw');
	};

	it('refuses an alias that collides with an existing route', () => {
		const error = failsWith({
			sources: [source([['/pricing', '/plans', 'src/routes/plans/+page.brix.yaml']])],
			routes: routes('/pricing', '/plans')
		});
		expect(error).toBeInstanceOf(RedirectCompileError);
		expect(error.issues).toHaveLength(1);
		expect(error.issues[0].code).toBe('route-collision');
		expect(error.issues[0].file).toBe('src/routes/plans/+page.brix.yaml');
		expect(error.message).toContain('src/routes/plans/+page.brix.yaml');
		expect(error.message).toContain('/pricing');
	});

	it('refuses an alias that collides with a prerendered path or static asset', () => {
		const error = failsWith({
			sources: [source([['/robots.txt', '/pricing']])],
			routes: routes('/pricing'),
			knownPaths: ['/robots.txt']
		});
		expect(error.issues[0].code).toBe('route-collision');
	});

	it('allows an alias a dynamic route could otherwise have matched', () => {
		expect(() =>
			compileRedirects({
				sources: [source([['/anything', '/pricing']])],
				routes: routes('/[...catchall]', '/pricing')
			})
		).not.toThrow();
	});

	it('refuses an alias claimed by two pages, naming both files', () => {
		const error = failsWith({
			sources: [
				source([['/plans', '/pricing', 'src/routes/pricing/+page.brix.yaml']]),
				source([['/plans', '/packages', 'src/routes/packages/+page.brix.yaml']])
			],
			routes: routes('/pricing', '/packages')
		});
		expect(error.issues[0].code).toBe('duplicate-alias');
		expect(error.issues[0].file).toBe('src/routes/packages/+page.brix.yaml');
		expect(error.message).toContain('src/routes/pricing/+page.brix.yaml');
	});

	it('refuses a destination that resolves to nothing', () => {
		const error = failsWith({
			sources: [source([['/old', '/gone', 'src/routes/a/+page.brix.yaml']])],
			routes: routes('/pricing')
		});
		expect(error.issues[0].code).toBe('unresolved-destination');
		expect(error.issues[0].file).toBe('src/routes/a/+page.brix.yaml');
		expect(error.message).toContain('/gone');
	});

	it('refuses a cycle, naming the loop and the other file in it', () => {
		const error = failsWith({
			sources: [
				source([
					['/a', '/b', 'a.yaml'],
					['/b', '/a', 'b.yaml']
				])
			],
			routes: routes('/pricing')
		});
		const cycles = error.issues.filter((issue) => issue.code === 'cycle');
		expect(cycles).toHaveLength(2);
		expect(cycles[0].message).toContain('/a → /b → /a');
		expect(cycles[0].message).toContain('b.yaml');
	});

	it('refuses an alias that redirects to itself', () => {
		const error = failsWith({ sources: [source([['/a', '/a', 'a.yaml']])] });
		expect(error.issues[0].code).toBe('cycle');
		expect(error.issues[0].file).toBe('a.yaml');
	});

	it('refuses an alias written as an absolute URL', () => {
		const error = failsWith({ sources: [source([['https://x.test/old', '/pricing', 'a.yaml']])] });
		expect(error.issues[0].code).toBe('invalid-rule');
		expect(error.message).toContain('a.yaml');
	});

	it('refuses aliases on a page with no single URL', () => {
		const error = failsWith({
			sources: [source([['/old', '/blog/[slug]', 'src/routes/blog/[slug]/+page.brix.yaml']])]
		});
		expect(error.issues[0].code).toBe('invalid-rule');
		expect(error.message).toContain('dynamic route segments');
	});

	it('refuses a status no browser treats as a redirect', () => {
		const error = failsWith({
			sources: [source([['/old', '/pricing', 'a.yaml', 200]])],
			routes: routes('/pricing')
		});
		expect(error.issues[0].code).toBe('invalid-rule');
		expect(error.message).toContain('200');
	});

	it('refuses paths that cannot be expressed in a redirects file', () => {
		const error = failsWith({
			sources: [
				source([
					['/old page', '/pricing', 'space.yaml'],
					['/old?ref=x', '/pricing', 'query.yaml'],
					['/a/../b', '/pricing', 'traversal.yaml']
				])
			],
			routes: routes('/pricing')
		});
		expect(error.issues.map((issue) => issue.file)).toEqual([
			'space.yaml',
			'query.yaml',
			'traversal.yaml'
		]);
	});

	it('reports every issue at once rather than the first', () => {
		const error = failsWith({
			sources: [
				source([
					['/pricing', '/plans', 'collide.yaml'],
					['/old', '/gone', 'unresolved.yaml']
				])
			],
			routes: routes('/pricing', '/plans')
		});
		expect(error.issues.map((issue) => issue.code)).toEqual([
			'route-collision',
			'unresolved-destination'
		]);
	});
});

describe('analyzeRedirects', () => {
	it('reports issues without throwing, keeping the rules that are sound', () => {
		const { redirects, issues } = analyzeRedirects({
			sources: [
				source([
					['/good', '/pricing', 'good.yaml'],
					['/bad', '/gone', 'bad.yaml']
				])
			],
			routes: routes('/pricing')
		});
		expect(redirects.map((rule) => rule.from)).toEqual(['/good']);
		expect(issues.map((issue) => issue.file)).toEqual(['bad.yaml']);
	});

	it('drops a rule whose chain passes through a broken one', () => {
		const { redirects, issues } = analyzeRedirects({
			sources: [
				source([
					['/a', '/b', 'a.yaml'],
					['/b', '/gone', 'b.yaml']
				])
			],
			routes: routes('/pricing')
		});
		expect(redirects).toEqual([]);
		// Only the rule that is actually wrong is reported; `/a` is collateral.
		expect(issues).toHaveLength(1);
		expect(issues[0].file).toBe('b.yaml');
	});
});
