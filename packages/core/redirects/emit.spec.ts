import { describe, expect, it } from 'vitest';
import {
	formatRedirectsFile,
	mergeRedirectsFile,
	REDIRECTS_BANNER,
	toVercelRoutes
} from './emit.js';
import type { RedirectRule } from './types.js';

const rule = (from: string, to: string, status = 301): RedirectRule => ({
	from,
	to,
	status: status as RedirectRule['status'],
	file: 'page.yaml',
	source: 'page aliases',
	via: []
});

describe('formatRedirectsFile', () => {
	it('writes one line per rule, in the given order', () => {
		expect(
			formatRedirectsFile([rule('/plans', '/pricing'), rule('/x', 'https://y.test', 302)])
		).toBe(
			`${REDIRECTS_BANNER}\n` +
				'/plans  /pricing  301\n' +
				'/x  https://y.test  302\n' +
				'# brixter:redirects end\n'
		);
	});

	it('emits nothing when there is nothing to redirect', () => {
		expect(formatRedirectsFile([])).toBe('');
	});
});

describe('mergeRedirectsFile', () => {
	const block = formatRedirectsFile([rule('/plans', '/pricing')]);

	it('prepends the block so it wins over an adapter catch-all', () => {
		const merged = mergeRedirectsFile('/*  /.netlify/functions/render  200\n', block);
		expect(merged.indexOf('/plans')).toBeLessThan(merged.indexOf('/.netlify'));
	});

	it('replaces a previously generated block instead of stacking copies', () => {
		const first = mergeRedirectsFile('/*  /index.html  200\n', block);
		const second = mergeRedirectsFile(first, formatRedirectsFile([rule('/a', '/b')]));
		expect(second.match(new RegExp(REDIRECTS_BANNER, 'g'))).toHaveLength(1);
		expect(second).not.toContain('/plans');
		expect(second).toContain('/a  /b  301');
		expect(second).toContain('/index.html');
	});

	it('removes the block when there is nothing left to emit', () => {
		const existing = mergeRedirectsFile('/*  /index.html  200\n', block);
		expect(mergeRedirectsFile(existing, '')).toBe('/*  /index.html  200\n');
	});

	it('handles an empty file', () => {
		expect(mergeRedirectsFile('', block)).toBe(block);
	});
});

describe('toVercelRoutes', () => {
	it('emits a Build Output API route with a real status and Location header', () => {
		expect(toVercelRoutes([rule('/old-pricing', '/pricing', 308)])).toEqual([
			{ src: '^/old-pricing/?$', headers: { Location: '/pricing' }, status: 308 }
		]);
	});

	it('escapes regex metacharacters in the matched path', () => {
		expect(toVercelRoutes([rule('/a.b+c', '/pricing')])[0].src).toBe('^/a\\.b\\+c/?$');
	});

	it('matches the same path under either trailing-slash policy', () => {
		const [route] = toVercelRoutes([rule('/old/', '/pricing')]);
		expect(new RegExp(route.src).test('/old')).toBe(true);
		expect(new RegExp(route.src).test('/old/')).toBe(true);
		expect(new RegExp(route.src).test('/older')).toBe(false);
	});
});
