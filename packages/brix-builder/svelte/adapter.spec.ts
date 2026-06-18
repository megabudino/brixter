import { describe, expect, it } from 'vitest';
import { createBrixDefinitions, createLayoutDefinitions } from './adapter';
import { createBrikSchemaFromMarkup } from './markup-schema';

describe('createLayoutDefinitions', () => {
	it('builds layout definitions from layoutFields and markup', () => {
		const definitions = createLayoutDefinitions(
			{
				'../lib/brixter/layouts/Marketing.svelte': {
					default: {} as never,
					layoutDescription: 'Marketing wrapper.',
					layoutFields: {
						accent: { kind: 'color', default: '#FDE047' },
						headerVariant: {
							kind: 'select',
							default: 'solid',
							options: [
								{ label: 'Solid', value: 'solid' },
								{ label: 'Transparent', value: 'transparent' }
							]
						}
					}
				}
			},
			{
				'../lib/brixter/layouts/Marketing.svelte': `
					<div data-brixter-field="banner" data-brixter-default="Hello">{banner}</div>
				`
			}
		);

		expect(definitions).toHaveLength(1);
		expect(definitions[0]?.name).toBe('Marketing');
		expect(definitions[0]?.description).toBe('Marketing wrapper.');
		expect(definitions[0]?.fields.accent?.kind).toBe('color');
		expect(definitions[0]?.fields.headerVariant?.kind).toBe('select');
		expect(definitions[0]?.fields.banner?.default).toBe('Hello');
		expect(definitions[0]?.defaults).toMatchObject({
			accent: '#FDE047',
			headerVariant: 'solid',
			banner: 'Hello'
		});
	});

	it('normalizes the layout name from the file name', () => {
		const definitions = createLayoutDefinitions({
			'../lib/brixter/layouts/blog-post.svelte': { default: {} as never }
		});

		expect(definitions[0]?.name).toBe('BlogPost');
	});
});

describe('createBrikSchemaFromMarkup', () => {
	it('builds preview fields from markup attributes', () => {
		const fields = createBrikSchemaFromMarkup(`
			<script module lang="ts">
				export const ignore = true;
			</script>

			<section>
				<h2
					data-brixter-field="headline"
					data-brixter-kind="richtext-inline"
					data-brixter-default="Titolo"
				>
					{@html headline}
				</h2>
				<div data-brixter-collection-item="articles">
					<h3 data-brixter-field="articles[].title" data-brixter-default="Nuovo articolo">
						{article.title}
					</h3>
				</div>
			</section>
		`);

		expect(fields).toEqual({
			headline: {
				kind: 'richtext-inline',
				default: 'Titolo',
				previewInMarkup: true
			},
			articles: {
				kind: 'array',
				item: {
					fields: {
						title: {
							default: 'Nuovo articolo',
							previewInMarkup: true
						}
					}
				}
			}
		});
	});
});

describe('createBrixDefinitions', () => {
	it('merges markup preview fields with inspector-only module fields', () => {
		const definitions = createBrixDefinitions(
			{
				'../lib/brixter/brix/Cta.brix.svelte': {
					default: {} as never,
					brikFields: {
						cta: {
							fields: {
								href: {
									default: '/contatti'
								}
							}
						},
						note: {
							kind: 'richtext-inline',
							default: ''
						}
					}
				}
			},
			{
				'../lib/brixter/brix/Cta.brix.svelte': `
					<div>
						<h2
							data-brixter-field="headline"
							data-brixter-kind="richtext-inline"
							data-brixter-default="Titolo"
						>
							{@html headline}
						</h2>
						<a data-brixter-field="cta.label" data-brixter-default="Parliamone">
							{cta.label}
						</a>
					</div>
				`
			}
		);

		expect(definitions[0]?.fields).toEqual({
			headline: {
				kind: 'richtext-inline',
				default: 'Titolo',
				previewInMarkup: true
			},
			cta: {
				kind: 'object',
				fields: {
					label: {
						default: 'Parliamone',
						previewInMarkup: true
					},
					href: {
						default: '/contatti'
					}
				}
			},
			note: {
				kind: 'richtext-inline',
				default: ''
			}
		});

		expect(definitions[0]?.previewBindings).toEqual([
			{
				type: 'richtext',
				selector: '[data-brixter-field="headline"]',
				path: 'headline',
				label: undefined,
				richTextMode: 'inline'
			},
			{
				type: 'text',
				selector: '[data-brixter-field="cta.label"]',
				path: 'cta.label',
				label: undefined
			}
		]);

		expect(definitions[0]?.defaults).toEqual({
			headline: {
				kind: 'richtext',
				mode: 'inline',
				html: 'Titolo',
				json: null
			},
			cta: {
				label: 'Parliamone',
				href: '/contatti'
			},
			note: {
				kind: 'richtext',
				mode: 'inline',
				html: '',
				json: null
			}
		});
	});
});
