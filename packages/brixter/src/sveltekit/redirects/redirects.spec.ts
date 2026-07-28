import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Adapter, Builder } from '@sveltejs/kit';
import { routeIdToPattern } from '@brixter/core/redirects';
import { collectRedirects, withRedirects } from './index.ts';
import { scanBrixPages, scanRoutes, scanStaticAssets } from './scan.ts';
import { resolveOutDir, targetFromAdapter, targetFromEnv, writeRedirects } from './targets.ts';

const temporaries: string[] = [];

afterEach(() => {
	for (const dir of temporaries.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** Build a throwaway project tree: `{ 'src/routes/a/+page.brix.yaml': '…' }`. */
function project(files: Record<string, string>): string {
	const root = mkdtempSync(path.join(tmpdir(), 'brixter-redirects-'));
	temporaries.push(root);
	for (const [relative, contents] of Object.entries(files)) {
		const file = path.join(root, relative);
		mkdirSync(path.dirname(file), { recursive: true });
		writeFileSync(file, contents);
	}
	return root;
}

function fakeBuilder(routeIds: string[], prerendered: string[] = []): Builder {
	return {
		config: { kit: { files: { routes: 'src/routes', assets: 'static' } } },
		routes: routeIds.map((id) => ({ id, pattern: routeIdToPattern(id) })),
		prerendered: { paths: prerendered },
		log: { minor() {}, info() {}, warn() {}, error() {}, success() {} }
	} as unknown as Builder;
}

function fakeAdapter(name: string, onAdapt?: () => void): Adapter {
	return {
		name,
		adapt() {
			onAdapt?.();
		}
	};
}

describe('scanBrixPages', () => {
	it('finds pages, their URL, and the file to blame', () => {
		const root = project({
			'src/routes/+page.brix.yaml': 'title: Home\n',
			'src/routes/(marketing)/pricing/+page.brix.yaml': 'title: Pricing\naliases:\n  - /plans\n',
			'src/routes/about/+page.svelte': '<h1>About</h1>',
			'src/routes/blog/[slug]/+page.brix.yaml': 'title: Post\n'
		});
		const pages = scanBrixPages(path.join(root, 'src/routes'), root);

		expect(pages.map((page) => [page.file, page.url])).toEqual([
			['src/routes/(marketing)/pricing/+page.brix.yaml', '/pricing'],
			['src/routes/+page.brix.yaml', '/'],
			['src/routes/blog/[slug]/+page.brix.yaml', null]
		]);
		expect(pages[0].metadata).toMatchObject({ aliases: ['/plans'] });
		// A page on a dynamic route has no single URL; its id is kept so the
		// compiler can name the file if it declares aliases anyway.
		expect(pages[2].routeId).toBe('/blog/[slug]');
	});

	it('skips a page whose YAML does not parse, leaving that error to the compiler', () => {
		const root = project({ 'src/routes/x/+page.brix.yaml': 'title: [unclosed\n' });
		expect(scanBrixPages(path.join(root, 'src/routes'), root)).toEqual([]);
	});
});

describe('scanRoutes', () => {
	it('treats every directory with a page or endpoint as a route', () => {
		const root = project({
			'src/routes/+page.svelte': '',
			'src/routes/pricing/+page.brix.yaml': '',
			'src/routes/sitemap.xml/+server.ts': '',
			'src/routes/blog/[slug]/+page.svelte': '',
			'src/routes/+layout.svelte': ''
		});
		const ids = scanRoutes(path.join(root, 'src/routes'))
			.map((route) => route.id)
			.sort();
		expect(ids).toEqual(['/', '/blog/[slug]', '/pricing', '/sitemap.xml']);
	});
});

describe('scanStaticAssets', () => {
	it('lists assets as root-relative URLs, and tolerates no static directory', () => {
		const root = project({ 'static/files/paper.pdf': '%PDF' });
		expect(scanStaticAssets(path.join(root, 'static'))).toEqual(['/files/paper.pdf']);
		expect(scanStaticAssets(path.join(root, 'nope'))).toEqual([]);
	});
});

describe('collectRedirects', () => {
	it('compiles the aliases declared across the site', () => {
		const root = project({
			'src/routes/pricing/+page.brix.yaml':
				'title: Pricing\naliases:\n  - /plans\n  - /old-pricing\n',
			'src/routes/about/+page.brix.yaml':
				'title: About\naliases:\n  - path: /company\n    status: 302\n'
		});
		const rules = collectRedirects(fakeBuilder(['/pricing', '/about']), {}, root);

		return expect(rules).resolves.toEqual([
			expect.objectContaining({ from: '/company', to: '/about', status: 302 }),
			expect.objectContaining({ from: '/old-pricing', to: '/pricing', status: 301 }),
			expect.objectContaining({ from: '/plans', to: '/pricing', status: 301 })
		]);
	});

	it('resolves a destination that is a prerendered path or a static asset', async () => {
		const root = project({
			'static/files/paper.pdf': '%PDF',
			'src/routes/x/+page.brix.yaml': 'aliases: [/paper]\nredirect_to: ignored\n'
		});
		// The page's own aliases point at the page; add a source that points elsewhere.
		const rules = await collectRedirects(
			fakeBuilder(['/x']),
			{
				sources: [
					{
						name: 'redirects.yaml',
						rules: [{ from: '/whitepaper', to: '/files/paper.pdf', file: 'redirects.yaml' }]
					}
				]
			},
			root
		);
		expect(rules.map((rule) => rule.from)).toEqual(['/paper', '/whitepaper']);
	});

	it('takes extra sources from a factory, given the pages it found', async () => {
		const root = project({ 'src/routes/pricing/+page.brix.yaml': 'title: Pricing\n' });
		const rules = await collectRedirects(
			fakeBuilder(['/pricing']),
			{
				sources: ({ pages }) => [
					{
						name: 'redirects.yaml',
						rules: pages.map((page) => ({ from: '/legacy', to: page.url, file: 'redirects.yaml' }))
					}
				]
			},
			root
		);
		expect(rules).toEqual([
			expect.objectContaining({ from: '/legacy', to: '/pricing', source: 'redirects.yaml' })
		]);
	});

	it('fails on an alias that collides with a route, naming the page file', async () => {
		const root = project({
			'src/routes/plans/+page.brix.yaml': 'aliases: [/pricing]\n',
			'src/routes/pricing/+page.brix.yaml': 'title: Pricing\n'
		});
		await expect(collectRedirects(fakeBuilder(['/plans', '/pricing']), {}, root)).rejects.toThrow(
			/src\/routes\/plans\/\+page\.brix\.yaml.*\/pricing/s
		);
	});

	it('fails on an alias declared by two pages, naming both', async () => {
		const root = project({
			'src/routes/a/+page.brix.yaml': 'aliases: [/shared]\n',
			'src/routes/b/+page.brix.yaml': 'aliases: [/shared]\n'
		});
		await expect(collectRedirects(fakeBuilder(['/a', '/b']), {}, root)).rejects.toThrow(
			/src\/routes\/a\/\+page\.brix\.yaml/
		);
	});

	it('fails on aliases declared by a page with no single URL', async () => {
		const root = project({ 'src/routes/blog/[slug]/+page.brix.yaml': 'aliases: [/old-blog]\n' });
		await expect(collectRedirects(fakeBuilder(['/blog/[slug]']), {}, root)).rejects.toThrow(
			/blog\/\[slug\]\/\+page\.brix\.yaml/
		);
	});
});

describe('target detection', () => {
	it('reads the deployment format off the adapter name', () => {
		expect(targetFromAdapter('@sveltejs/adapter-netlify')).toBe('netlify');
		expect(targetFromAdapter('@sveltejs/adapter-vercel')).toBe('vercel');
		expect(targetFromAdapter('@sveltejs/adapter-cloudflare')).toBe('cloudflare');
		expect(targetFromAdapter('@sveltejs/adapter-auto')).toBeNull();
		expect(targetFromAdapter('@sveltejs/adapter-static')).toBeNull();
	});

	it('falls back to the build environment, as adapter-auto does', () => {
		expect(targetFromEnv({ NETLIFY: 'true' })).toBe('netlify');
		expect(targetFromEnv({ VERCEL: '1' })).toBe('vercel');
		expect(targetFromEnv({ CF_PAGES: '1' })).toBe('cloudflare');
		expect(targetFromEnv({})).toBeNull();
	});

	it('prefers the publish directory declared in netlify.toml', () => {
		const root = project({
			'netlify.toml': '[build]\n  command = "vite build"\n  publish = "dist"\n',
			'dist/index.html': ''
		});
		expect(resolveOutDir('netlify', root)).toBe(path.join(root, 'dist'));
	});

	it('reports nothing rather than guessing when no output directory exists', () => {
		expect(resolveOutDir('netlify', project({}))).toBeNull();
	});
});

describe('writeRedirects', () => {
	const rule = {
		from: '/plans',
		to: '/pricing',
		status: 301 as const,
		file: 'p.yaml',
		source: 's',
		via: []
	};

	it('prepends to an adapter-written _redirects so the catch-all cannot swallow it', () => {
		const root = project({ 'build/_redirects': '/*  /.netlify/functions/render  200\n' });
		const { file } = writeRedirects('netlify', [rule], path.join(root, 'build'));
		const contents = readFileSync(file, 'utf-8');
		expect(contents.indexOf('/plans  /pricing  301')).toBeLessThan(contents.indexOf('/.netlify'));
	});

	it('writes a _redirects file for Cloudflare Pages', () => {
		const root = project({ '.svelte-kit/cloudflare/index.html': '' });
		const { file } = writeRedirects(
			'cloudflare',
			[rule],
			path.join(root, '.svelte-kit/cloudflare')
		);
		expect(readFileSync(file, 'utf-8')).toContain('/plans  /pricing  301');
	});

	it('puts Vercel routes ahead of the filesystem handler', () => {
		const root = project({
			'.vercel/output/config.json': JSON.stringify({
				version: 3,
				routes: [{ handle: 'filesystem' }]
			})
		});
		const { file } = writeRedirects('vercel', [rule], path.join(root, '.vercel/output'));
		const config = JSON.parse(readFileSync(file, 'utf-8'));
		expect(config.routes[0]).toEqual({
			src: '^/plans/?$',
			headers: { Location: '/pricing' },
			status: 301
		});
		expect(config.routes[1]).toEqual({ handle: 'filesystem' });
		expect(config.version).toBe(3);
	});

	it('converges when the same output is written twice', () => {
		const root = project({
			'.vercel/output/config.json': JSON.stringify({ routes: [{ handle: 'filesystem' }] })
		});
		const outDir = path.join(root, '.vercel/output');
		writeRedirects('vercel', [rule], outDir);
		const { file } = writeRedirects('vercel', [rule], outDir);
		expect(JSON.parse(readFileSync(file, 'utf-8')).routes).toHaveLength(2);
	});
});

describe('withRedirects', () => {
	const inProject = async (root: string, run: () => Promise<void>) => {
		const cwd = process.cwd();
		process.chdir(root);
		try {
			await run();
		} finally {
			process.chdir(cwd);
		}
	};

	it('runs the wrapped adapter and emits its native format', async () => {
		const root = project({
			'src/routes/pricing/+page.brix.yaml': 'title: Pricing\naliases: [/plans]\n',
			'build/_redirects': '/*  /.netlify/functions/render  200\n'
		});
		let adapted = false;
		const adapter = withRedirects(fakeAdapter('@sveltejs/adapter-netlify', () => (adapted = true)));

		await inProject(root, async () => {
			await adapter.adapt(fakeBuilder(['/pricing']));
		});

		expect(adapted).toBe(true);
		expect(readFileSync(path.join(root, 'build/_redirects'), 'utf-8')).toContain(
			'/plans  /pricing  301'
		);
	});

	it('stops the build before the adapter runs when a redirect is inconsistent', async () => {
		const root = project({
			'src/routes/a/+page.brix.yaml': 'aliases: [/dup]\n',
			'src/routes/b/+page.brix.yaml': 'aliases: [/dup]\n'
		});
		let adapted = false;
		const adapter = withRedirects(fakeAdapter('@sveltejs/adapter-netlify', () => (adapted = true)));
		await inProject(root, async () => {
			await expect(adapter.adapt(fakeBuilder(['/a', '/b']))).rejects.toThrow(
				/\[brixter\] redirects:[\s\S]*\+page\.brix\.yaml/
			);
		});
		expect(adapted).toBe(false);
	});

	it('refuses to guess a format rather than falling back to a meta refresh', async () => {
		const root = project({ 'src/routes/a/+page.brix.yaml': 'title: A\n' });
		const adapter = withRedirects(fakeAdapter('@sveltejs/adapter-static'));
		await inProject(root, async () => {
			await expect(adapter.adapt(fakeBuilder(['/a']))).rejects.toThrow(/Set `target`/);
		});
	});

	it('honours an explicit target and outDir', async () => {
		const root = project({
			'src/routes/pricing/+page.brix.yaml': 'title: Pricing\naliases: [/plans]\n',
			'dist/index.html': ''
		});
		const adapter = withRedirects(fakeAdapter('@sveltejs/adapter-static'), {
			target: 'netlify',
			outDir: 'dist'
		});
		await inProject(root, async () => {
			await adapter.adapt(fakeBuilder(['/pricing']));
		});
		expect(readFileSync(path.join(root, 'dist/_redirects'), 'utf-8')).toContain('/plans');
	});

	it('validates without emitting when emit is off', async () => {
		const root = project({
			'src/routes/pricing/+page.brix.yaml': 'title: Pricing\naliases: [/plans]\n'
		});
		const adapter = withRedirects(fakeAdapter('@sveltejs/adapter-static'), { emit: false });
		await inProject(root, async () => {
			await expect(adapter.adapt(fakeBuilder(['/pricing']))).resolves.toBeUndefined();
		});
	});

	it('keeps the wrapped adapter identifiable', () => {
		expect(withRedirects(fakeAdapter('@sveltejs/adapter-vercel')).name).toContain(
			'@sveltejs/adapter-vercel'
		);
	});
});
