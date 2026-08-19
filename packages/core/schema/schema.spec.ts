import { describe, expect, it } from 'vitest';
import { buildBrikSchema, compileBrikSchema, SchemaError, validateProps } from './index.js';

const brik = (body: string, frontmatter = '') =>
	buildBrikSchema(`---\ntitle: Test\n${frontmatter}---\n${body}`, { file: 'Test.brix' });

describe('buildBrikSchema', () => {
	it('reads title and description from the frontmatter', () => {
		const { schema } = buildBrikSchema(
			'---\ntitle: Pricing\ndescription: Plans.\n---\n<p>{x}</p>',
			{
				file: 'Pricing.brix'
			}
		);

		expect(schema.title).toBe('Pricing');
		expect(schema.description).toBe('Plans.');
	});

	it('falls back to a humanised file name for the title', () => {
		expect(buildBrikSchema('<p>{x}</p>', { name: 'CoreOffer' }).schema.title).toBe('Core offer');
	});

	it('works with no frontmatter at all', () => {
		const { schema, issues } = buildBrikSchema('<h1>{headline}</h1>');

		expect(issues).toEqual([]);
		expect(schema.props.headline).toMatchObject({ type: 'string' });
	});

	it('rejects any frontmatter key beyond title and description', () => {
		const { issues } = brik('<p>{x}</p>', 'fields:\n  x:\n    kind: text\n');

		expect(issues.map((entry) => entry.code)).toEqual(['unknown-key']);
		expect(issues[0].message).toContain('`fields`');
		expect(issues[0].line).toBe(3);
	});

	it('reports a template syntax error with a line, and no AST', () => {
		const { issues, nodes } = brik('<p>{#each plans}<b>x</b>{/each}</p>');

		expect(nodes).toBeNull();
		expect(issues[0].code).toBe('template-syntax');
		expect(issues[0].line).toBeGreaterThanOrEqual(4);
	});

	it('reports invalid frontmatter YAML', () => {
		const { issues } = buildBrikSchema('---\ntitle: "oops\n---\n<p>x</p>', { file: 'X.brix' });

		expect(issues.some((entry) => entry.code === 'frontmatter-syntax')).toBe(true);
	});
});

describe('compileBrikSchema', () => {
	it('returns the definition when the brik is sound', () => {
		expect(compileBrikSchema('<h1>{headline}</h1>').schema.props.headline.type).toBe('string');
	});

	it('throws with every issue attached', () => {
		try {
			compileBrikSchema('<p>{@sparkle x}</p>', { file: 'X.brix' });
			expect.unreachable();
		} catch (error) {
			expect(error).toBeInstanceOf(SchemaError);
			expect((error as SchemaError).issues).toHaveLength(1);
			expect((error as SchemaError).message).toContain('X.brix');
		}
	});
});

describe('validateProps', () => {
	const schemaOf = (body: string) => buildBrikSchema(body).schema;
	const check = (body: string, props: unknown) =>
		validateProps(props, schemaOf(body), { file: '+page.md' });
	const codes = (body: string, props: unknown) => check(body, props).map((entry) => entry.code);

	it('accepts props that match', () => {
		expect(codes('<h1>{headline}</h1>', { headline: 'Hi' })).toEqual([]);
	});

	it('rejects a prop the template never uses', () => {
		expect(codes('<h1>{headline}</h1>', { subtitle: 'Hi' })).toEqual(['unknown-prop']);
	});

	it('suggests a near miss', () => {
		const [entry] = check('<h1>{headline}</h1>', { headlien: 'Hi' });

		expect(entry.message).toContain('Did you mean `headline`?');
	});

	it('rejects a missing `@required` prop', () => {
		expect(codes('<h1>{@required headline}</h1>', {})).toEqual(['missing-required']);
		expect(codes('<h1>{@required headline}</h1>', { headline: '' })).toEqual(['missing-required']);
	});

	it.each([
		['<p>{@number count}</p>', { count: 'lots' }],
		['<p>{@boolean flag}</p>', { flag: 'yes' }],
		['<h1>{headline}</h1>', { headline: 12 }],
		['{#each plans as plan}<b>{plan.name}</b>{/each}', { plans: 'nope' }],
		['<a>{cta.label}</a>', { cta: 'nope' }]
	])('rejects a mismatched value in %s', (body, props) => {
		expect(codes(body, props)).toEqual(['type-mismatch']);
	});

	it('names what it expected and what it got', () => {
		const [entry] = check('{#each plans as plan}<b>{plan.name}</b>{/each}', { plans: 'nope' });

		expect(entry.message).toContain('`plans` expects a list, but got text');
	});

	it('rejects a value outside `@enum`', () => {
		const body = "<b>{@enum('yellow','blue') accent}</b>";

		expect(codes(body, { accent: 'blue' })).toEqual([]);
		expect(codes(body, { accent: 'red' })).toEqual(['not-in-options']);
	});

	it('enforces numeric bounds', () => {
		const body = '<p>{@number @min(1) @max(9) count}</p>';

		expect(codes(body, { count: 5 })).toEqual([]);
		expect(codes(body, { count: 0 })).toEqual(['constraint']);
		expect(codes(body, { count: 10 })).toEqual(['constraint']);
	});

	it('enforces bounds on collection length and string length', () => {
		expect(codes('{#each @min(2) plans as plan}<b>{plan}</b>{/each}', { plans: ['a'] })).toEqual([
			'constraint'
		]);
		expect(codes('<p>{@max(3) slug}</p>', { slug: 'toolong' })).toEqual(['constraint']);
	});

	it('enforces `@pattern`', () => {
		const body = "<p>{@pattern('^[a-z]+$') slug}</p>";

		expect(codes(body, { slug: 'ok' })).toEqual([]);
		expect(codes(body, { slug: 'Not OK' })).toEqual(['constraint']);
	});

	it('descends into collection entries and names the index', () => {
		const [entry] = check('{#each plans as plan}<b>{@number plan.price}</b>{/each}', {
			plans: [{ price: 1 }, { price: 'free' }]
		});

		expect(entry.code).toBe('type-mismatch');
		expect(entry.path).toBe('plans[1].price');
	});

	it('descends into nested objects', () => {
		expect(
			codes('<a href={cta.href}>{cta.label}</a>', { cta: { label: 'Go', hrf: '/x' } })
		).toEqual(['unknown-prop']);
	});

	it('treats an explicit null as "use the default"', () => {
		expect(codes('<p>{@number count}</p>', { count: null })).toEqual([]);
	});

	it('accepts any shape for a `@json` prop', () => {
		expect(codes('<p>{@json data}</p>', { data: { any: ['thing'] } })).toEqual([]);
	});

	it('reports a non-mapping `props`', () => {
		expect(codes('<h1>{headline}</h1>', 'nope')).toEqual(['type-mismatch']);
	});

	it('prefixes paths and positions through the context', () => {
		const issues = validateProps({ nope: 1 }, schemaOf('<h1>{headline}</h1>'), {
			file: '+page.md',
			basePath: 'brix[0].props',
			locate: (path) => (path === 'brix[0].props.nope' ? { line: 7, column: 5 } : undefined)
		});

		expect(issues[0]).toMatchObject({ path: 'brix[0].props.nope', line: 7, column: 5 });
		expect(issues[0].message).toContain('+page.md:7:5');
	});
});
