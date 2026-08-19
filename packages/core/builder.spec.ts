import { describe, expect, it } from 'vitest';
import {
	BUILDER_ITEM_ID_KEY,
	addCollectionItem,
	collectionsFromSchema,
	createFallbackProps,
	documentFromPage,
	getCollectionItemImagePath,
	getCollectionItemSummary,
	getValueAtPath,
	pageFromDocument,
	previewBindingsFromSchema,
	removeCollectionItem,
	reorderCollectionItem,
	stripItemIds,
	toComponentName,
	updatePropsAtPath
} from './builder.js';
import { buildBrikSchema } from './schema/index.js';
import { parsePage } from './page/index.js';

const PRICING = `---
title: Pricing
---
<p>{eyebrow ?? 'Pricing'}</p>
<a href={cta.href ?? '#'}>{cta.label ?? 'Go'}</a>
{#each plans as plan}
	<article>
		<h3>{plan.name ?? 'Starter'}</h3>
		<img src={@image plan.logo} alt="" />
		<span>{@enum('a','b') plan.accent ?? 'a'}</span>
	</article>
{/each}`;

const schema = buildBrikSchema(PRICING, { file: 'Pricing.brix' }).schema;

describe('previewBindingsFromSchema', () => {
	const bindings = previewBindingsFromSchema(schema.props);
	const paths = bindings.map((binding) => binding.path);

	it('flattens every editable prop, including inside collections', () => {
		expect(paths).toEqual([
			'eyebrow',
			'cta.href',
			'cta.label',
			'plans[].name',
			'plans[].logo',
			'plans[].accent'
		]);
	});

	it('carries the selector the renderer anchors with', () => {
		expect(bindings[0].selector).toBe('[data-brixter-field="eyebrow"]');
		expect(bindings[3].selector).toBe('[data-brixter-field="plans[].name"]');
	});

	it('carries the inferred type and label', () => {
		expect(bindings[4]).toMatchObject({ type: 'image', label: 'Logo' });
	});
});

describe('collectionsFromSchema', () => {
	const [plans] = collectionsFromSchema(schema.props);

	it('describes the collection the editor can edit', () => {
		expect(plans).toMatchObject({
			path: 'plans',
			itemLabel: 'Plan',
			summaryField: 'name',
			imageField: 'logo',
			previewSelector: '[data-brixter-collection-item="plans"]'
		});
	});

	it('builds a fresh entry from the item schema defaults', () => {
		expect(plans.defaultItem).toEqual({ name: 'Starter', logo: '', accent: 'a' });
	});
});

describe('createFallbackProps', () => {
	it('fills every prop from the template `??` values', () => {
		const props = createFallbackProps(schema);

		expect(props.eyebrow).toBe('Pricing');
		expect((props.cta as Record<string, unknown>).label).toBe('Go');
	});

	it('synthesises placeholder entries for a collection with no data', () => {
		const plans = createFallbackProps(schema).plans as Array<Record<string, unknown>>;

		expect(plans.length).toBeGreaterThan(0);
		expect(plans[0].name).toBe('Starter');
	});

	it('gives placeholder entries stable ids so a keyed loop does not remount them', () => {
		const first = createFallbackProps(schema).plans as Array<Record<string, unknown>>;
		const second = createFallbackProps(schema).plans as Array<Record<string, unknown>>;

		expect(first[0][BUILDER_ITEM_ID_KEY]).toBe(second[0][BUILDER_ITEM_ID_KEY]);
	});

	it('lets real values win, filling only what is missing', () => {
		const props = createFallbackProps(schema, { eyebrow: 'Plans' });

		expect(props.eyebrow).toBe('Plans');
		expect((props.cta as Record<string, unknown>).label).toBe('Go');
	});

	it('leaves text empty when content fallbacks are off, keeping structure', () => {
		const props = createFallbackProps(schema, {}, { contentFallback: true });
		const bare = createFallbackProps(
			buildBrikSchema('<h1>{headline}</h1>').schema,
			{},
			{ contentFallback: false }
		);

		expect(props.eyebrow).toBe('Pricing');
		expect(bare.headline).toBe('');
	});
});

describe('prop manipulation', () => {
	const props = { cta: { label: 'Go' }, plans: [{ name: 'A' }, { name: 'B' }] };
	const [plans] = collectionsFromSchema(schema.props);

	it('reads a value at a path', () => {
		expect(getValueAtPath(props, 'cta.label')).toBe('Go');
		expect(getValueAtPath(props, 'plans[1].name')).toBe('B');
		expect(getValueAtPath(props, 'plans[9].name')).toBeUndefined();
	});

	it('writes without mutating the input', () => {
		const next = updatePropsAtPath(props, 'plans[0].name', 'Z');

		expect(getValueAtPath(next, 'plans[0].name')).toBe('Z');
		expect(getValueAtPath(props, 'plans[0].name')).toBe('A');
	});

	it('creates intermediate containers on the way down', () => {
		const next = updatePropsAtPath({}, 'a.b[0].c', 1);

		expect(getValueAtPath(next, 'a.b[0].c')).toBe(1);
	});

	it('adds, removes and reorders collection entries', () => {
		const added = addCollectionItem(props, plans);
		expect(getValueAtPath(added, 'plans')).toHaveLength(3);
		expect(getValueAtPath(added, 'plans[2].name')).toBe('Starter');

		const removed = removeCollectionItem(props, plans, 0);
		expect(getValueAtPath(removed, 'plans[0].name')).toBe('B');

		const moved = reorderCollectionItem(props, plans, 0, 1);
		expect(getValueAtPath(moved, 'plans[0].name')).toBe('B');
	});

	it('ignores an out-of-range reorder or removal', () => {
		expect(removeCollectionItem(props, plans, 9)).toBe(props);
		expect(reorderCollectionItem(props, plans, 0, 9)).toBe(props);
	});

	it('titles an entry by its summary field, falling back to a number', () => {
		expect(getCollectionItemSummary({ name: 'Pro' }, plans, 0)).toBe('Pro');
		expect(getCollectionItemSummary({}, plans, 1)).toBe('Plan 2');
	});

	it('addresses an entry thumbnail', () => {
		expect(getCollectionItemImagePath(plans, 2)).toBe('plans[2].logo');
	});
});

describe('documents', () => {
	const source = '---\nmetadata:\n  title: Home\nbrix:\n  - type: Hero\n    props:\n      plans:\n        - name: A\n---\n\nProse.\n';

	it('gives each block an id and each collection entry an identity', () => {
		const document = documentFromPage(parsePage(source).page);

		expect(document.blocks[0].id).toBeTruthy();
		expect(document.blocks[0].type).toBe('Hero');
		const plans = document.blocks[0].props.plans as Array<Record<string, unknown>>;
		expect(plans[0][BUILDER_ITEM_ID_KEY]).toBeTruthy();
	});

	it('round-trips back to a page with the identity stripped', () => {
		const page = pageFromDocument(documentFromPage(parsePage(source).page));

		expect(page.metadata).toEqual({ title: 'Home' });
		expect(page.brix).toEqual([{ type: 'Hero', props: { plans: [{ name: 'A' }] } }]);
		expect(page.body).toContain('Prose.');
	});

	it('strips ids at every depth', () => {
		expect(
			stripItemIds({ a: [{ [BUILDER_ITEM_ID_KEY]: 'x', b: [{ [BUILDER_ITEM_ID_KEY]: 'y', c: 1 }] }] })
		).toEqual({ a: [{ b: [{ c: 1 }] }] });
	});
});

describe('toComponentName', () => {
	it.each([
		['Hero', 'Hero'],
		['Hero.brix', 'Hero'],
		['hero-banner', 'HeroBanner'],
		['hero_banner', 'HeroBanner'],
		['CoreOffer.svelte', 'CoreOffer']
	])('%s → %s', (input, expected) => {
		expect(toComponentName(input)).toBe(expected);
	});
});
