import { describe, expect, it } from 'vitest';
import {
	addCollectionItem,
	createBlock,
	createBuilderDocument,
	createBuilderFallbackProps,
	getCollectionItems,
	getCollectionItemSummary,
	getDefinition,
	moveCollectionItem,
	parseBrixYamlDocument,
	removeCollectionItem,
	reorderCollectionItem,
	serializeToBrixYaml,
	serializeToMdsvex,
	updatePropsAtPath
} from './core';
import { createBrixDefinitions } from './svelte/adapter';

const pageBriks = createBrixDefinitions(
	{
		'../lib/brixter/brix/Markdown.svelte': {
			default: {} as never,
			brikMode: 'markdown',
			brikDefaults: {
				content: '## Nuovo brik'
			}
		},
		'../lib/brixter/brix/Hero.svelte': {
			default: {} as never,
			brikFields: {
				cta: {
					fields: {
						href: {
							default: '/contatti'
						}
					}
				}
			}
		}
	},
	{
		'../lib/brixter/brix/Hero.svelte': `
			<section>
				<h1 data-brixter-field="headline" data-brixter-default="Titolo">
					{headline}
				</h1>
				<a data-brixter-field="cta.label" data-brixter-default="Contattami">
					{cta.label}
				</a>
			</section>
		`
	}
);

const galleryBriks = createBrixDefinitions({
	'../lib/brixter/brix/Gallery.svelte': {
		default: {} as never,
		brikFields: {
			pieces: {
				label: 'Immagini',
				itemLabel: 'Immagine',
				summaryField: 'title',
				imageField: 'src',
				item: {
					fields: {
						src: {
							kind: 'image',
							default: '/images/paesaggio-estivo/paesaggio-estivo.webp'
						},
						title: {
							default: 'Nuova immagine'
						}
					}
				}
			}
		},
		brikDefaults: {
			pieces: [
				{ src: '/images/paesaggio-estivo/paesaggio-estivo.webp', title: 'Paesaggio Estivo' },
				{ src: '/images/pittura-modulare/pittura-modulare.webp', title: 'Pittura Modulare' },
				{ src: '/images/villa-rustica/villa-rustica.webp', title: 'Villa Rustica' }
			]
		}
	}
});

describe('brix definitions', () => {
	it('discovers briks from the provided modules', () => {
		expect(pageBriks.map((brik) => brik.type)).toEqual(['Markdown', 'Hero']);
		expect(galleryBriks.map((brik) => brik.type)).toEqual(['Gallery']);
	});
});

describe('serializeToMdsvex', () => {
	it('includes frontmatter and only imports component briks', () => {
		const document = createBuilderDocument(pageBriks);
		const output = serializeToMdsvex(document, pageBriks);

		expect(output).toContain('title: Pagina Brixter');
		expect(output).toContain("import Hero from '$lib/brixter/brix/Hero.svelte';");
		expect(output).toContain('<Hero {...blockProps2} />');
		expect(output).toContain('## Nuovo brik');
		expect(output).not.toContain("import Markdown from '$lib/brixter/brix/Markdown.svelte';");
	});

	it('creates generic briks from inferred defaults', () => {
		const block = createBlock('Hero', pageBriks);

		expect(block.type).toBe('Hero');
		expect(block.props).toMatchObject({
			headline: 'Titolo',
			cta: {
				label: 'Contattami',
				href: '/contatti'
			}
		});
	});

	it('derives preview bindings from markup-first metadata', () => {
		const definition = getDefinition('Hero', pageBriks);

		expect(definition.previewBindings).toEqual([
			{
				type: 'text',
				selector: '[data-brixter-field="headline"]',
				path: 'headline',
				label: undefined
			},
			{
				type: 'text',
				selector: '[data-brixter-field="cta.label"]',
				path: 'cta.label',
				label: undefined
			}
		]);
	});

	it('derives editable collections from the brik schema', () => {
		const definition = getDefinition('Gallery', galleryBriks);

		expect(definition.collections).toEqual([
			{
				path: 'pieces',
				label: 'Immagini',
				itemLabel: 'Immagine',
				defaultItem: {
					src: '/images/paesaggio-estivo/paesaggio-estivo.webp',
					title: 'Nuova immagine'
				},
				summaryField: 'title',
				imageField: 'src',
				previewSelector: '[data-brixter-collection-item="pieces"]'
			}
		]);
	});

	it('updates nested props through a resolved binding path', () => {
		const block = createBlock('Gallery', galleryBriks);
		const updated = updatePropsAtPath(block.props, 'pieces[1].src', 'data:image/png;base64,abc');

		expect((updated.pieces as Array<Record<string, string>>)[1]).toMatchObject({
			src: 'data:image/png;base64,abc',
			title: 'Pittura Modulare'
		});
		expect(block.props).not.toBe(updated);
	});

	it('adds, removes and reorders collection items', () => {
		const block = createBlock('Gallery', galleryBriks);
		const collection = getDefinition('Gallery', galleryBriks).collections[0];

		const appended = addCollectionItem(block.props, collection);
		expect(getCollectionItems(appended, collection)).toHaveLength(4);
		expect(getCollectionItemSummary(getCollectionItems(appended, collection)[3], collection, 3)).toBe(
			'Nuova immagine'
		);

		const reordered = moveCollectionItem(appended, collection, 3, -1);
		expect((getCollectionItems(reordered, collection)[2] as Record<string, string>).title).toBe(
			'Nuova immagine'
		);

		const removed = removeCollectionItem(reordered, collection, 2);
		expect(getCollectionItems(removed, collection)).toHaveLength(3);
	});

	it('reorders collection items to an explicit target index', () => {
		const block = createBlock('Gallery', galleryBriks);
		const collection = getDefinition('Gallery', galleryBriks).collections[0];
		const reordered = reorderCollectionItem(block.props, collection, 0, 2);

		expect((getCollectionItems(reordered, collection)[2] as Record<string, string>).title).toBe(
			'Paesaggio Estivo'
		);
	});
});

describe('brix yaml round-trip', () => {
	it('parses brix yaml into a builder document with metadata and component props', () => {
		const document = parseBrixYamlDocument(
			`
title: Home
description: Landing page
seo:
  robots: index
layout: marketing
components:
  - type: hero
    props:
      headline: Benvenuto
      cta:
        label: Scopri
  - type: Missing
    props:
      title: Ignored
`,
			pageBriks
		);

		expect(document.title).toBe('Home');
		expect(document.description).toBe('Landing page');
		expect(document.layout).toBe('marketing');
		expect(document.metadata).toEqual({ seo: { robots: 'index' } });
		expect(document.blocks).toHaveLength(1);
		expect(document.blocks[0]).toMatchObject({
			type: 'Hero',
			props: {
				headline: 'Benvenuto',
				cta: {
					label: 'Scopri',
					href: '/contatti'
				}
			}
		});
	});

	it('serializes builder documents to the vite brix yaml format', () => {
		const block = createBlock('Hero', pageBriks);
		block.props = updatePropsAtPath(block.props, 'headline', 'Titolo YAML');
		const output = serializeToBrixYaml(
			{
				title: 'Home',
				description: 'Landing page',
				layout: 'marketing',
				metadata: { seo: { robots: 'index' } },
				blocks: [createBlock('Markdown', pageBriks), block]
			},
			pageBriks
		);

		expect(output).toContain('title: Home');
		expect(output).toContain('description: Landing page');
		expect(output).toContain('layout: marketing');
		expect(output).toContain('seo:');
		expect(output).toContain('components:');
		expect(output).toContain('type: Hero');
		expect(output).toContain('headline: Titolo YAML');
		expect(output).not.toContain('type: Markdown');
	});

	it('preserves empty strings in raw props during update and serialization', () => {
		const block = createBlock('Hero', pageBriks);
		const updated = updatePropsAtPath(block.props, 'headline', '');
		expect(updated.headline).toBe('');

		const output = serializeToBrixYaml(
			{
				title: 'Home',
				description: 'Landing page',
				layout: 'marketing',
				metadata: {},
				blocks: [
					{
						id: '1',
						type: 'Hero',
						props: updated
					}
				]
			},
			pageBriks
		);
		expect(output).toContain('headline: ""');
	});
});
