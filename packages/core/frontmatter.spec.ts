import { describe, expect, it } from 'vitest';
import { joinFrontmatter, splitFrontmatter, splitPath } from './frontmatter.js';

describe('splitFrontmatter', () => {
	it('splits data from body', () => {
		const doc = splitFrontmatter('---\ntitle: Pricing\n---\n\n## Heading\n\nProse.\n');

		expect(doc.present).toBe(true);
		expect(doc.data).toEqual({ title: 'Pricing' });
		expect(doc.body).toBe('\n## Heading\n\nProse.\n');
	});

	it('treats a source without a fence as all body', () => {
		const doc = splitFrontmatter('<section>markup</section>');

		expect(doc.present).toBe(false);
		expect(doc.data).toEqual({});
		expect(doc.body).toBe('<section>markup</section>');
	});

	it('accepts an empty frontmatter block', () => {
		const doc = splitFrontmatter('---\n---\nbody');

		expect(doc.present).toBe(true);
		expect(doc.data).toEqual({});
		expect(doc.body).toBe('body');
	});

	it('does not treat a `---` further down the file as an opening fence', () => {
		const doc = splitFrontmatter('# Title\n\n---\n\nMore prose.\n');

		expect(doc.present).toBe(false);
		expect(doc.body).toBe('# Title\n\n---\n\nMore prose.\n');
	});

	it('leaves a horizontal rule in the body alone', () => {
		const doc = splitFrontmatter('---\ntitle: X\n---\n\nOne.\n\n---\n\nTwo.\n');

		expect(doc.data).toEqual({ title: 'X' });
		expect(doc.body).toBe('\nOne.\n\n---\n\nTwo.\n');
	});

	it('reports an opened fence that is never closed', () => {
		const doc = splitFrontmatter('---\ntitle: Pricing\n\nProse with no closing fence.\n');

		expect(doc.present).toBe(false);
		expect(doc.unterminated).toBe(true);
		expect(doc.issues[0].message).toContain('unterminated');
	});

	it('reports YAML syntax errors with a position, and yields no data', () => {
		const doc = splitFrontmatter('---\ntitle: "unterminated\n---\nbody');

		expect(doc.issues.length).toBeGreaterThan(0);
		expect(doc.issues[0].position.line).toBeGreaterThanOrEqual(2);
		expect(doc.data).toEqual({});
	});
});

describe('positionAt / positionOf', () => {
	const source = [
		'---',
		'metadata:',
		'  title: Pricing',
		'brix:',
		'  - type: Hero',
		'    props:',
		'      headline: Ship pages',
		'---',
		'',
		'Body.'
	].join('\n');

	it('locates a nested mapping value', () => {
		const doc = splitFrontmatter(source);

		// `headline: Ship pages` is on line 7; the value starts after the key.
		expect(doc.positionOf('brix[0].props.headline').line).toBe(7);
		expect(doc.positionOf('metadata.title').line).toBe(3);
		expect(doc.positionOf('brix[0].type').line).toBe(5);
	});

	it('falls back to the nearest resolvable ancestor', () => {
		const doc = splitFrontmatter(source);

		// `subtitle` does not exist — point at the props map that should hold it.
		// A block map's range starts at its first entry, so that is line 7.
		expect(doc.positionOf('brix[0].props.subtitle').line).toBe(7);
		expect(doc.positionOf('nope.at.all').line).toBe(2);
	});

	it('maps offsets to 1-based line and column', () => {
		const doc = splitFrontmatter(source);

		expect(doc.positionAt(0)).toEqual({ line: 1, column: 1, offset: 0 });
		expect(doc.positionAt(source.indexOf('brix:'))).toMatchObject({ line: 4, column: 1 });
	});
});

describe('splitPath', () => {
	it('splits dots and bracket indices', () => {
		expect(splitPath('brix[0].props.cta.href')).toEqual(['brix', 0, 'props', 'cta', 'href']);
		expect(splitPath('plans[2]')).toEqual(['plans', 2]);
		expect(splitPath('headline')).toEqual(['headline']);
	});

	it('addresses the first entry for the schema-shaped `[]` marker', () => {
		expect(splitPath('plans[].name')).toEqual(['plans', 0, 'name']);
		expect(splitPath('plans[].tiers[].label')).toEqual(['plans', 0, 'tiers', 0, 'label']);
	});
});

describe('joinFrontmatter', () => {
	it('round-trips through splitFrontmatter', () => {
		const source = joinFrontmatter('title: Pricing\n', '## Heading\n');
		const doc = splitFrontmatter(source);

		expect(doc.data).toEqual({ title: 'Pricing' });
		expect(doc.body.trim()).toBe('## Heading');
	});

	it('emits only the block when the body is empty', () => {
		expect(joinFrontmatter('title: X', '')).toBe('---\ntitle: X\n---\n');
	});
});
