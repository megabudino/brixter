import { describe, expect, it } from 'vitest';
import { parsePage, serializePage } from './index.js';

const source = [
	'---',
	'metadata:',
	'  title: Pricing',
	'  description: Plans.',
	'layout: Marketing',
	'aliases:',
	'  - /plans',
	'brix:',
	'  - type: Hero',
	'    props:',
	'      headline: Ship pages',
	'  - type: Pricing',
	'---',
	'',
	'## FAQ',
	''
].join('\n');

describe('parsePage', () => {
	it('reads metadata, layout, aliases, brix and body', () => {
		const { page, issues } = parsePage(source, '+page.md');

		expect(issues).toEqual([]);
		expect(page.metadata).toEqual({ title: 'Pricing', description: 'Plans.' });
		expect(page.layout).toBe('Marketing');
		expect(page.aliases).toEqual(['/plans']);
		expect(page.brix).toEqual([
			{ type: 'Hero', props: { headline: 'Ship pages' } },
			{ type: 'Pricing', props: {} }
		]);
		expect(page.body.trim()).toBe('## FAQ');
	});

	it('accepts a page with only a body', () => {
		const { page, issues } = parsePage('Just prose.\n');

		expect(issues).toEqual([]);
		expect(page.brix).toEqual([]);
		expect(page.metadata).toEqual({});
		expect(page.body).toBe('Just prose.\n');
	});

	it('rejects an unknown top-level key and points at the key itself', () => {
		const { issues } = parsePage('---\ntitle: Oops\nbrix: []\n---\n', '+page.md');

		expect(issues).toHaveLength(1);
		expect(issues[0]).toMatchObject({ code: 'unknown-key', path: 'title', line: 2, column: 1 });
		expect(issues[0].message).toContain('`metadata`');
	});

	it('leaves unknown keys inside `metadata` alone — the layout may read them', () => {
		const { page, issues } = parsePage('---\nmetadata:\n  theme: dark\n---\n');

		expect(issues).toEqual([]);
		expect(page.metadata).toEqual({ theme: 'dark' });
	});

	it('rejects a `brix` that is not a list', () => {
		const { issues } = parsePage('---\nbrix: nope\n---\n', '+page.md');

		expect(issues[0]).toMatchObject({ code: 'type-mismatch', path: 'brix' });
	});

	it('rejects a section with no `type`, and keeps the others', () => {
		const { page, issues } = parsePage(
			'---\nbrix:\n  - props: {}\n  - type: Hero\n---\n',
			'+page.md'
		);

		expect(issues[0]).toMatchObject({ code: 'unknown-brik', path: 'brix[0]' });
		expect(page.brix).toEqual([{ type: 'Hero', props: {} }]);
	});

	it('reports invalid frontmatter YAML', () => {
		const { issues } = parsePage('---\nbrix: [\n---\n', '+page.md');

		expect(issues.some((entry) => entry.code === 'frontmatter-syntax')).toBe(true);
	});

	it('locates a prop inside a section', () => {
		const { positionOf } = parsePage(source, '+page.md');

		expect(positionOf('brix[0].props.headline').line).toBe(11);
	});
});

describe('serializePage', () => {
	it('round-trips', () => {
		const { page } = parsePage(source, '+page.md');
		const { page: again, issues } = parsePage(serializePage(page), '+page.md');

		expect(issues).toEqual([]);
		expect(again.metadata).toEqual(page.metadata);
		expect(again.layout).toBe(page.layout);
		expect(again.brix).toEqual(page.brix);
		expect(again.body.trim()).toBe(page.body.trim());
	});

	it('omits keys the page does not use', () => {
		const output = serializePage({ metadata: {}, brix: [], body: '' });

		expect(output).not.toContain('metadata');
		expect(output).not.toContain('layout');
		expect(output).toContain('brix');
	});
});
