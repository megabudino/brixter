import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { compileDevRedirects, resolveDevRedirect } from './redirects.ts';

const temporaries: string[] = [];

afterEach(() => {
	for (const dir of temporaries.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function project(files: Record<string, string>): string {
	const root = mkdtempSync(path.join(tmpdir(), 'brixter-dev-redirects-'));
	temporaries.push(root);
	for (const [relative, contents] of Object.entries(files)) {
		const file = path.join(root, relative);
		mkdirSync(path.dirname(file), { recursive: true });
		writeFileSync(file, contents);
	}
	return root;
}

describe('compileDevRedirects', () => {
	it('compiles page aliases against the routes found on disk', () => {
		const root = project({
			'src/routes/pricing/+page.brix.yaml': 'title: Pricing\naliases: [/plans]\n',
			'src/routes/+page.svelte': ''
		});
		const compiled = compileDevRedirects(root);
		expect(compiled.map.get('/plans')).toEqual({ to: '/pricing', status: 301 });
		expect(compiled.warnings).toEqual([]);
	});

	it('reports inconsistencies as warnings instead of throwing', () => {
		const root = project({
			'src/routes/a/+page.brix.yaml': 'aliases: [/dup]\n',
			'src/routes/b/+page.brix.yaml': 'aliases: [/dup]\n'
		});
		const compiled = compileDevRedirects(root);
		expect(compiled.warnings).toHaveLength(1);
		expect(compiled.warnings[0]).toContain('+page.brix.yaml');
		// The rule that was declared first still works while the clash is fixed.
		expect(compiled.map.get('/dup')).toEqual({ to: '/a', status: 301 });
	});

	it('accepts the same extra sources the adapter takes', () => {
		const root = project({ 'src/routes/pricing/+page.brix.yaml': 'title: Pricing\n' });
		const compiled = compileDevRedirects(root, {
			sources: [
				{
					name: 'redirects.yaml',
					rules: [{ from: '/legacy', to: '/pricing', file: 'redirects.yaml' }]
				}
			]
		});
		expect(compiled.map.get('/legacy')).toEqual({ to: '/pricing', status: 301 });
	});
});

describe('resolveDevRedirect', () => {
	const compiled = {
		map: new Map([
			['/plans', { to: '/pricing', status: 301 }],
			['/chat', { to: 'https://discord.gg/x', status: 302 }]
		]),
		warnings: []
	};

	it('matches a request path, whatever its trailing slash', () => {
		expect(resolveDevRedirect(compiled, '/plans')).toEqual({ location: '/pricing', status: 301 });
		expect(resolveDevRedirect(compiled, '/plans/')).toEqual({ location: '/pricing', status: 301 });
	});

	it('carries the query string across, as the hosting layers do', () => {
		expect(resolveDevRedirect(compiled, '/plans?ref=email')).toEqual({
			location: '/pricing?ref=email',
			status: 301
		});
	});

	it('answers an external destination with its own status', () => {
		expect(resolveDevRedirect(compiled, '/chat')).toEqual({
			location: 'https://discord.gg/x',
			status: 302
		});
	});

	it('leaves anything else to the app', () => {
		expect(resolveDevRedirect(compiled, '/pricing')).toBeNull();
		expect(resolveDevRedirect(compiled, '/')).toBeNull();
	});
});
