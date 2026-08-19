import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createBrikRegistry } from './briks.ts';
import { compileBrixPage, isBrixPage } from './page.ts';

const roots: string[] = [];

/** A throwaway project holding the given briks, keyed by file name. */
function project(briks: Record<string, string>) {
	const root = mkdtempSync(path.join(tmpdir(), 'brixter-page-'));
	roots.push(root);
	const dir = path.join(root, 'src', 'lib', 'brixter', 'brix');
	mkdirSync(dir, { recursive: true });
	for (const [name, source] of Object.entries(briks)) {
		writeFileSync(path.join(dir, name), source);
	}
	return { root, registry: createBrikRegistry(dir, root) };
}

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const HERO = '---\ntitle: Hero\n---\n<h1>{@required headline}</h1><p>{subtitle ?? "Sub"}</p>';

describe('isBrixPage', () => {
	it.each([
		['/src/routes/+page.md', true],
		['/src/routes/pricing/+page.md', true],
		['/src/routes/dash/+page@(app).md', true],
		['/src/routes/+page.md?raw', true],
		['/src/routes/+page.svelte', false],
		['/src/lib/README.md', false],
		['/src/routes/+layout.md', false]
	])('%s → %s', (id, expected) => {
		expect(isBrixPage(id)).toBe(expected);
	});
});

describe('compileBrixPage', () => {
	const compile = (source: string, briks: Record<string, string> = { 'Hero.brix': HERO }) => {
		const { registry } = project(briks);
		return compileBrixPage(source, '+page.md', {}, registry);
	};

	it('emits the frontmatter and metadata as module exports', () => {
		const { code, issues } = compile('---\nmetadata:\n  title: Home\n---\n');

		expect(issues).toEqual([]);
		expect(code).toContain('<script module>');
		expect(code).toContain('"title": "Home"');
		expect(code).toContain('export const metadata = frontmatter.metadata;');
	});

	it('renders each brik through the runtime interpreter', () => {
		const { code } = compile('---\nbrix:\n  - type: Hero\n    props:\n      headline: Hi\n---\n');

		expect(code).toContain("import Brix0Source from '$lib/brixter/brix/Hero.brix?raw'");
		expect(code).toContain("import { renderBrikSource } from '@brixter/core'");
		expect(code).toContain('{@html renderBrikSource(Brix0Source, brix0Props');
		expect(code).toContain('"headline": "Hi"');
	});

	it('imports a hand-written `.svelte` brik as a component instead', () => {
		const { code, issues } = compile('---\nbrix:\n  - type: Custom\n---\n', {
			'Custom.svelte': '<h1>hi</h1>'
		});

		expect(issues).toEqual([]);
		expect(code).toContain("import Brix0 from '$lib/brixter/brix/Custom.svelte'");
		expect(code).toContain('<Brix0 {...brix0Props} />');
	});

	it('imports a repeated brik once and keeps per-section props', () => {
		const { code } = compile(
			'---\nbrix:\n  - type: Hero\n    props: { headline: A }\n  - type: Hero\n    props: { headline: B }\n---\n'
		);

		expect(code.match(/import Brix0Source/g)).toHaveLength(1);
		expect(code).toContain('"headline": "A"');
		expect(code).toContain('"headline": "B"');
	});

	it('injects `<BrixSeo>` unless turned off', () => {
		const { registry } = project({ 'Hero.brix': HERO });
		const source = '---\nmetadata:\n  title: X\n---\n';

		expect(compileBrixPage(source, '+page.md', {}, registry).code).toContain('<BrixSeo');
		expect(compileBrixPage(source, '+page.md', { seo: false }, registry).code).not.toContain(
			'<BrixSeo'
		);
	});

	it('wraps the page in its layout and hands it the markdown body', () => {
		const { code } = compile('---\nlayout: Marketing\n---\n\n## Prose\n');

		expect(code).toContain("import BrixLayout from '$lib/brixter/layouts/Marketing.svelte'");
		expect(code).toContain('<BrixLayout {metadata} {content}>');
		expect(code).toContain('<h2>Prose</h2>');
	});

	it('renders the body after the sections when there is no layout', () => {
		const { code } = compile('---\nbrix: []\n---\n\nJust prose.\n');

		expect(code).toContain('{@html content}');
		expect(code).not.toContain('BrixLayout');
	});

	it('declares no `content` binding for a page with neither body nor layout', () => {
		expect(compile('---\nbrix: []\n---\n').code).not.toContain('const content');
	});

	it('passes the editor-anchor setting through to the renderer', () => {
		const { registry } = project({ 'Hero.brix': HERO });
		const source = '---\nbrix:\n  - type: Hero\n    props: { headline: Hi }\n---\n';

		expect(compileBrixPage(source, '+page.md', {}, registry).code).toContain(
			'"editorAnchors": true'
		);
		expect(
			compileBrixPage(source, '+page.md', { editorAnchors: false }, registry).code
		).toContain('"editorAnchors": false');
	});
});

describe('validation during compilation', () => {
	const codes = (source: string, briks: Record<string, string> = { 'Hero.brix': HERO }) => {
		const { registry } = project(briks);
		return compileBrixPage(source, '+page.md', {}, registry).issues.map((issue) => issue.code);
	};

	it('accepts a page that matches its briks', () => {
		expect(codes('---\nbrix:\n  - type: Hero\n    props: { headline: Hi }\n---\n')).toEqual([]);
	});

	it('reports a brik that does not exist, with a suggestion', () => {
		const { registry } = project({ 'Hero.brix': HERO });
		const { issues } = compileBrixPage(
			'---\nbrix:\n  - type: Hreo\n---\n',
			'+page.md',
			{},
			registry
		);

		expect(issues[0].code).toBe('unknown-brik');
		expect(issues[0].message).toContain('Did you mean `Hero`?');
		expect(issues[0].line).toBe(3);
	});

	it('reports a missing required prop and an unknown one', () => {
		expect(
			codes('---\nbrix:\n  - type: Hero\n    props: { subtitel: x }\n---\n')
		).toEqual(['unknown-prop', 'missing-required']);
	});

	it("reports a brik's own template problems once, however often the page uses it", () => {
		const reported = codes('---\nbrix:\n  - type: Bad\n  - type: Bad\n---\n', {
			'Bad.brix': '<p>{@sparkle x}</p>'
		});

		expect(reported).toEqual(['unknown-tag']);
	});

	it('does not validate a hand-written `.svelte` brik', () => {
		expect(
			codes('---\nbrix:\n  - type: Custom\n    props: { anything: 1 }\n---\n', {
				'Custom.svelte': '<h1>hi</h1>'
			})
		).toEqual([]);
	});

	it('still emits compilable code when a page has issues', () => {
		const { registry } = project({ 'Hero.brix': HERO });
		const { code } = compileBrixPage('---\nbrix:\n  - type: Hreo\n---\n', '+page.md', {}, registry);

		expect(code).toContain('<script module>');
	});
});
