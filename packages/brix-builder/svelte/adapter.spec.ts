import { describe, expect, it } from 'vitest';
import { createBrixDefinitions } from './adapter';
import { createBrikSchemaFromMarkup } from './markup-schema';

describe('createBrikSchemaFromMarkup', () => {
	it('builds preview fields from markup attributes', () => {
		const fields = createBrikSchemaFromMarkup(`
			<script module lang="ts">
				export const ignore = true;
			</script>

			<section>
				<h2
					data-builder-field="headline"
					data-builder-kind="richtext-inline"
					data-builder-default="Titolo"
				>
					{@html headline}
				</h2>
				<div data-builder-collection-item="articles">
					<h3 data-builder-field="articles[].title" data-builder-default="Nuovo articolo">
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
				'../lib/brixter/brix/Cta.svelte': {
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
				'../lib/brixter/brix/Cta.svelte': `
					<div>
						<h2
							data-builder-field="headline"
							data-builder-kind="richtext-inline"
							data-builder-default="Titolo"
						>
							{@html headline}
						</h2>
						<a data-builder-field="cta.label" data-builder-default="Parliamone">
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
				selector: '[data-builder-field="headline"]',
				path: 'headline',
				label: undefined,
				richTextMode: 'inline'
			},
			{
				type: 'text',
				selector: '[data-builder-field="cta.label"]',
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
