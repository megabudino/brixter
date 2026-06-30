import { describe, expect, it } from 'vitest';
import {
	addCollectionItem,
	createBlock,
	createBuilderDefaultsFromFields,
	createBuilderDocument,
	createBuilderFallbackProps,
	getCollectionItems,
	getCollectionItemSummary,
	getDefinition,
	moveCollectionItem,
	parseBrixYamlDocument,
	removeCollectionItem,
	reorderCollectionItem,
	resolveImagePropsForRender,
	serializeToBrixYaml,
	serializeToMdsvex,
	STANDARD_SEO_FIELDS,
	updatePropsAtPath
} from './core';
import type { BuilderFields } from './core';
import { createBrixDefinitions } from './svelte/adapter';

const pageBriks = createBrixDefinitions(
	{
		'../lib/brixter/brix/Markdown.brix.svelte': {
			default: {} as never,
			brikMode: 'markdown',
			brikDefaults: {
				content: '## Nuovo brik'
			}
		},
		'../lib/brixter/brix/Hero.brix.svelte': {
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
		'../lib/brixter/brix/Hero.brix.svelte': `
			<section>
				<h1 data-brixter-field="headline">
					Titolo
				</h1>
				<a data-brixter-field="cta.label">
					Contattami
				</a>
			</section>
		`
	}
);

const galleryBriks = createBrixDefinitions({
	'../lib/brixter/brix/Gallery.brix.svelte': {
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

const imageBriks = createBrixDefinitions({
	'../lib/brixter/brix/Banner.brix.svelte': {
		default: {} as never,
		brikFields: {
			image: {
				kind: 'image'
			}
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

	it('leaves text/richtext empty under structural fallback but keeps scaffolding', () => {
		// The editing canvas renders with { contentFallback: false } so cleared
		// fields stay empty (CSS placeholder chrome) instead of showing fake copy,
		// while collections/images keep their visual scaffolding.
		const definition = getDefinition('Gallery', galleryBriks);
		const merged = createBuilderFallbackProps(
			definition,
			{ pieces: [{ src: '', title: '' }] },
			{ contentFallback: false }
		) as { pieces: Array<Record<string, string>> };

		expect(merged.pieces).toHaveLength(1);
		// text stays empty (no canned getFallbackText copy)
		expect(merged.pieces[0].title).toBe('');
		// image keeps the structural placeholder so it stays visible/clickable
		expect(merged.pieces[0].src).toContain('data:image/svg+xml');
	});

	it('does not bake canned placeholder text into new block props', () => {
		// createBlock uses structural fallback: a text field without a default must
		// start empty, not with getFallbackText copy.
		const block = createBlock('Banner', imageBriks);
		expect(block.props.image).toContain('data:image/svg+xml');

		// Gallery item title has a default ("Nuova immagine") which is honored, but a
		// fieldless text would be ''. Confirm Hero headline default is still honored.
		const hero = createBlock('Hero', pageBriks);
		expect(hero.props.headline).toBe('Titolo');
	});

	it('re-injects field placeholders into collection items at render time', () => {
		// Round-trip: a saved item with an empty image (img: "") must still show
		// the visual placeholder in the builder, not a broken image.
		const definition = getDefinition('Gallery', galleryBriks);
		const merged = createBuilderFallbackProps(definition, {
			pieces: [
				{ src: '', title: 'Build better pages' },
				{ src: '', title: 'Another' }
			]
		}) as { pieces: Array<Record<string, string>> };

		expect(merged.pieces).toHaveLength(2);
		expect(merged.pieces[0].src).toContain('data:image/svg+xml');
		expect(merged.pieces[0].title).toBe('Build better pages');
		expect(merged.pieces[1].src).toContain('data:image/svg+xml');
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

	it('strips image placeholder fallbacks instead of persisting them', () => {
		// createBlock bakes the visual image placeholder (a data:image/svg+xml URL)
		// into props for fields without a default. It must never reach the file.
		const block = createBlock('Banner', imageBriks);
		expect(block.props.image).toContain('data:image/svg+xml');

		const output = serializeToBrixYaml(
			{
				title: 'Home',
				description: 'Landing page',
				metadata: {},
				blocks: [block]
			},
			imageBriks
		);

		expect(output).not.toContain('data:image/svg+xml');
		expect(output).toContain('image: ""');
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

describe('standard SEO fields', () => {
	it('produces sensible defaults for the new field kinds', () => {
		const defaults = createBuilderDefaultsFromFields(STANDARD_SEO_FIELDS);

		expect(defaults.title).toBe('');
		expect(defaults.description).toBe('');
		expect(defaults.canonical).toBe('');
		expect(defaults.robots).toBe('index,follow');
		expect(defaults.jsonLd).toBeNull();
		expect(defaults.og).toMatchObject({ type: 'website' });
		expect(defaults.twitter).toMatchObject({ card: 'summary_large_image' });
	});

	it('round-trips nested SEO metadata through brix yaml', () => {
		const output = serializeToBrixYaml(
			{
				title: 'Home',
				description: 'Welcome',
				metadata: {
					canonical: 'https://example.com',
					og: { title: 'Home', image: '/og.png' },
					jsonLd: { '@context': 'https://schema.org', '@type': 'WebSite' }
				},
				blocks: []
			},
			pageBriks
		);

		const reparsed = parseBrixYamlDocument(output, pageBriks);
		expect(reparsed.title).toBe('Home');
		expect(reparsed.metadata).toMatchObject({
			canonical: 'https://example.com',
			og: { title: 'Home', image: '/og.png' },
			jsonLd: { '@context': 'https://schema.org', '@type': 'WebSite' }
		});
	});
});

describe('resolveImagePropsForRender', () => {
	const fields: BuilderFields = {
		title: { default: 'Hi' },
		hero: { kind: 'image' },
		cta: {
			fields: {
				label: { default: 'Click' },
				icon: { kind: 'image' }
			}
		},
		gallery: {
			item: {
				fields: {
					img: { kind: 'image' },
					caption: { default: '' }
				}
			}
		}
	};

	const resolve = (src: string) => `/proxy?path=${src}`;

	it('rewrites top-level, nested-object, and array-item image values', () => {
		const result = resolveImagePropsForRender(
			{
				title: 'Hi',
				hero: '/hero.png',
				cta: { label: 'Click', icon: '/icon.png' },
				gallery: [
					{ img: '/a.png', caption: 'A' },
					{ img: '/b.png', caption: 'B' }
				]
			},
			fields,
			resolve
		);

		expect(result.title).toBe('Hi');
		expect(result.hero).toBe('/proxy?path=/hero.png');
		expect(result.cta).toEqual({ label: 'Click', icon: '/proxy?path=/icon.png' });
		expect(result.gallery).toEqual([
			{ img: '/proxy?path=/a.png', caption: 'A' },
			{ img: '/proxy?path=/b.png', caption: 'B' }
		]);
	});

	it('leaves empty image values untouched and does not mutate the input', () => {
		const input = { hero: '', cta: { label: 'Click', icon: '/icon.png' } };
		const result = resolveImagePropsForRender(input, fields, resolve);

		expect(result.hero).toBe('');
		expect(input.cta.icon).toBe('/icon.png');
	});
});
