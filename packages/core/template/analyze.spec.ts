import { describe, expect, it } from 'vitest';
import { analyzeTemplate, tokenizePath } from './analyze.js';
import { parseTemplate } from './parser.js';
import type { BrikSchema, SchemaIssue } from '../schema/types.js';

function analyze(template: string): { schema: BrikSchema; issues: SchemaIssue[] } {
	return analyzeTemplate(parseTemplate(template), { file: 'Test.brix' });
}

const propsOf = (template: string) => analyze(template).schema.props;
const codesOf = (template: string) => analyze(template).issues.map((issue) => issue.code);

describe('type inference', () => {
	it('reads plain interpolation as a string', () => {
		expect(propsOf('<p>{eyebrow}</p>').eyebrow).toMatchObject({ type: 'string' });
	});

	it.each([
		['{@richtext headline}', 'richtext'],
		['{@icon headline}', 'icon'],
		['{@image headline}', 'image'],
		['{@number headline}', 'number'],
		['{@boolean headline}', 'boolean'],
		['{@date headline}', 'date'],
		['{@color headline}', 'color'],
		['{@json headline}', 'json'],
		['{@url headline}', 'url']
	])('reads %s as %s', (expression, type) => {
		expect(propsOf(`<p>${expression}</p>`).headline).toMatchObject({ type });
	});

	it('reads an `{#each}` collection as an array', () => {
		expect(propsOf('{#each plans as plan}<b>{plan.name}</b>{/each}').plans).toMatchObject({
			type: 'array',
			items: { type: 'object', fields: { name: { type: 'string' } } }
		});
	});

	it('reads sub-paths as an object', () => {
		expect(propsOf('<a>{cta.label}</a>').cta).toMatchObject({
			type: 'object',
			fields: { label: { type: 'string' } }
		});
	});

	it('infers `image` and `url` from the attribute being fed', () => {
		const props = propsOf('<a href={cta}><img src={shot}></a>');

		expect(props.cta).toMatchObject({ type: 'url' });
		expect(props.shot).toMatchObject({ type: 'image' });
	});

	it('reads a path only ever tested by `{#if}` as a boolean', () => {
		expect(propsOf('{#if featured}<b>x</b>{/if}').featured).toMatchObject({ type: 'boolean' });
	});

	it('reads `{#if cta}` guarding `{cta.label}` as an object, not a boolean', () => {
		expect(propsOf('{#if cta}<a>{cta.label}</a>{/if}').cta).toMatchObject({ type: 'object' });
	});

	it('falls back to the literal type of a `??` default', () => {
		const props = propsOf('<p>{count ?? 12}</p><p>{flag ?? false}</p>');

		expect(props.count).toMatchObject({ type: 'number', default: 12 });
		expect(props.flag).toMatchObject({ type: 'boolean', default: false });
	});

	it('reads `@enum` as an enum carrying its options', () => {
		expect(propsOf("<b>{@enum('a','b') accent}</b>").accent).toMatchObject({
			type: 'enum',
			options: ['a', 'b']
		});
	});

	it('lets an explicit tag win over the position it is used in', () => {
		expect(propsOf('<img src={@string shot}>').shot).toMatchObject({ type: 'string' });
	});

	it('does not treat an unannotated occurrence as a conflicting claim', () => {
		expect(codesOf('<p>{@number count}</p><p>{count}</p>')).toEqual([]);
		expect(propsOf('<p>{@number count}</p><p>{count}</p>').count).toMatchObject({
			type: 'number'
		});
	});
});

describe('nesting', () => {
	it('resolves nested collections into a nested schema', () => {
		const plans = propsOf(
			'{#each plans as plan}{#each plan.tiers as tier}<b>{tier.label}</b>{/each}{/each}'
		).plans;

		expect(plans).toMatchObject({
			type: 'array',
			items: { type: 'object', fields: { tiers: { type: 'array', items: { type: 'object' } } } }
		});
	});

	it('reads a collection of scalars used through its alias', () => {
		expect(propsOf('{#each tags as tag}<li>{tag}</li>{/each}').tags).toMatchObject({
			type: 'array',
			items: { type: 'string' }
		});
	});

	it('ignores an index binding — it is not a prop', () => {
		expect(propsOf('{#each items as item, i}<li>{i}{item}</li>{/each}')).not.toHaveProperty('i');
	});
});

describe('annotations', () => {
	it('marks `@required`', () => {
		expect(propsOf('<h1>{@required headline}</h1>').headline).toMatchObject({ required: true });
	});

	it('records constraints', () => {
		const props = propsOf("<p>{@min(1) @max(9) count}</p><p>{@pattern('^[a-z]+$') slug}</p>");

		expect(props.count).toMatchObject({ min: 1, max: 9 });
		expect(props.slug).toMatchObject({ pattern: '^[a-z]+$' });
	});

	it('uses `@label` and otherwise humanises the key', () => {
		const props = propsOf("<a>{@label('Button link') ctaHref}</a><p>{cta_note}</p>");

		expect(props.ctaHref.label).toBe('Button link');
		expect(props.cta_note.label).toBe('Cta note');
	});
});

describe('editor metadata for collections', () => {
	const props = propsOf(
		'{#each plans as plan}<article>{plan.badge}{plan.name}<img src={plan.logo}></article>{/each}'
	);

	it('derives a singular item label', () => {
		expect(props.plans.itemLabel).toBe('Plan');
		expect(props.plans.items?.label).toBe('Plan');
	});

	it('prefers a name-like key as the entry summary over the first string', () => {
		expect(props.plans.summaryField).toBe('name');
	});

	it('picks the first image field as the entry thumbnail', () => {
		expect(props.plans.imageField).toBe('logo');
	});

	it.each([
		['categories', 'Category'],
		['reviews', 'Review'],
		['boxes', 'Box'],
		['team', 'Team']
	])('singularises `%s` to `%s`', (key, label) => {
		expect(propsOf(`{#each ${key} as x}<b>{x}</b>{/each}`)[key].itemLabel).toBe(label);
	});
});

describe('issues', () => {
	it('reports two different type tags on one path', () => {
		expect(codesOf('<p>{@number x}</p><p>{@richtext x}</p>')).toEqual(['type-conflict']);
	});

	it('reports a scalar tag on a path the template iterates', () => {
		expect(codesOf('{#each @number plans as plan}<b>{plan.name}</b>{/each}')).toContain(
			'type-conflict'
		);
	});

	it('reports a collection also rendered as a value', () => {
		expect(codesOf('<p>{plans}</p>{#each plans as plan}<b>{plan}</b>{/each}')).toContain(
			'type-conflict'
		);
	});

	it('reports `@required` together with a `??` default', () => {
		expect(codesOf("<h1>{@required headline ?? 'Hi'}</h1>")).toEqual(['required-with-default']);
	});

	it('reports an unknown annotation', () => {
		expect(codesOf('<p>{@sparkle headline}</p>')).toEqual(['unknown-tag']);
	});

	it.each([
		['<p>{@enum() accent}</p>', '`@enum` with no values'],
		["<p>{@min('x') count}</p>", '`@min` with a string'],
		['<p>{@label(3) x}</p>', '`@label` with a number'],
		["<p>{@pattern('[') x}</p>", 'an invalid regex']
	])('reports %s — %s', (template) => {
		expect(codesOf(template)).toEqual(['tag-argument']);
	});

	it('names the file and the path in the message', () => {
		const [issue] = analyze('<p>{@number x}</p><p>{@richtext x}</p>').issues;

		expect(issue.file).toBe('Test.brix');
		expect(issue.path).toBe('x');
		expect(issue.message).toContain('Test.brix');
		expect(issue.message).toContain('`x`');
	});
});

describe('`{@prop}` declarations', () => {
	it('adds a prop the markup never renders', () => {
		expect(propsOf('<div>{@prop @boolean autoplay ?? false}</div>').autoplay).toMatchObject({
			type: 'boolean',
			default: false
		});
	});
});

describe('tokenizePath', () => {
	it.each([
		['headline', ['headline']],
		['cta.href', ['cta', 'href']],
		['plans[]', ['plans', '[]']],
		['plans[].name', ['plans', '[]', 'name']],
		['plans[].tiers[].label', ['plans', '[]', 'tiers', '[]', 'label']]
	])('splits %s', (path, expected) => {
		expect(tokenizePath(path)).toEqual(expected);
	});
});
