import { afterEach, describe, expect, it, vi } from 'vitest';
import { runBrixControllers, type BrixController } from './runner.ts';

/**
 * Minimal fake DOM: a `root` whose `querySelectorAll` returns elements that
 * record their listener add/remove calls. Enough to exercise the runner without
 * pulling in jsdom.
 */
function fakeElement() {
	const added: string[] = [];
	const removed: string[] = [];
	return {
		added,
		removed,
		addEventListener: (type: string) => added.push(type),
		removeEventListener: (type: string) => removed.push(type)
	};
}

function fakeRoot(count: number) {
	const elements = Array.from({ length: count }, fakeElement);
	return {
		elements,
		querySelectorAll: () => elements
	} as unknown as ParentNode & { elements: ReturnType<typeof fakeElement>[] };
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe('runBrixControllers', () => {
	it('runs every exported init from every module (auto-registration)', () => {
		const calls: string[] = [];
		const modules = {
			'/controllers/a.ts': { initA: (() => (calls.push('a'), () => {})) as BrixController },
			'/controllers/b.ts': { default: (() => (calls.push('b'), () => {})) as BrixController }
		};

		runBrixControllers(modules, fakeRoot(0));

		expect(calls.sort()).toEqual(['a', 'b']);
	});

	it('runs modules in deterministic path order regardless of insertion order', () => {
		const calls: string[] = [];
		const make =
			(label: string): BrixController =>
			() => (calls.push(label), () => {});
		const modules = {
			'/controllers/zeta.ts': { initZeta: make('zeta') },
			'/controllers/alpha.ts': { initAlpha: make('alpha') },
			'/controllers/mid.ts': { initMid: make('mid') }
		};

		runBrixControllers(modules, fakeRoot(0));

		expect(calls).toEqual(['alpha', 'mid', 'zeta']);
	});

	it('attaches to every matched element and detaches them all on cleanup', () => {
		const tilt: BrixController = (root) => {
			const cleanups: Array<() => void> = [];
			root.querySelectorAll('[data-tilt]').forEach((el) => {
				el.addEventListener('pointermove', () => {});
				cleanups.push(() => el.removeEventListener('pointermove', () => {}));
			});
			return () => cleanups.forEach((fn) => fn());
		};

		const root = fakeRoot(3);
		const cleanup = runBrixControllers({ '/controllers/tilt.ts': { tilt } }, root);

		expect(root.elements.map((el) => el.added)).toEqual([
			['pointermove'],
			['pointermove'],
			['pointermove']
		]);
		expect(root.elements.every((el) => el.removed.length === 0)).toBe(true);

		cleanup();

		expect(root.elements.map((el) => el.removed)).toEqual([
			['pointermove'],
			['pointermove'],
			['pointermove']
		]);
	});

	it('isolates a throwing controller so the others still run and cleanup', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const ran: string[] = [];
		const cleaned: string[] = [];

		const modules = {
			'/controllers/a.ts': {
				initA: (() => {
					ran.push('a');
					return () => cleaned.push('a');
				}) as BrixController
			},
			'/controllers/boom.ts': {
				initBoom: (() => {
					throw new Error('kaboom');
				}) as BrixController
			},
			'/controllers/c.ts': {
				initC: (() => {
					ran.push('c');
					return () => cleaned.push('c');
				}) as BrixController
			}
		};

		const cleanup = runBrixControllers(modules, fakeRoot(0));

		expect(ran).toEqual(['a', 'c']);
		expect(error).toHaveBeenCalledWith(
			expect.stringContaining('[brix] controller "initBoom" in /controllers/boom.ts'),
			expect.any(Error)
		);

		cleanup();
		expect(cleaned.sort()).toEqual(['a', 'c']);
	});

	it('does not accumulate: a second cleanup call is a no-op', () => {
		let teardowns = 0;
		const modules = {
			'/controllers/a.ts': { initA: (() => () => teardowns++) as BrixController }
		};

		const cleanup = runBrixControllers(modules, fakeRoot(0));
		cleanup();
		cleanup();

		expect(teardowns).toBe(1);
	});

	it('tolerates a controller that returns no cleanup and a failing teardown', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const cleaned: string[] = [];
		const modules = {
			'/controllers/a.ts': { initA: (() => undefined) as unknown as BrixController },
			'/controllers/b.ts': {
				initB: (() => () => {
					throw new Error('teardown failed');
				}) as BrixController
			},
			'/controllers/c.ts': { initC: (() => () => cleaned.push('c')) as BrixController }
		};

		const cleanup = runBrixControllers(modules, fakeRoot(0));
		expect(() => cleanup()).not.toThrow();
		expect(cleaned).toEqual(['c']);
		expect(error).toHaveBeenCalledWith('[brix] controller cleanup failed', expect.any(Error));
	});
});
