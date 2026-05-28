import { describe, expect, it } from 'vitest';
import {
	createBuilderCollectionsFromFields,
	createBuilderPreviewBindingsFromFields,
	createInspectorFieldsFromFields
} from './core';

describe('builder selector inference', () => {
	it('infers preview selectors from builder field paths', () => {
		const bindings = createBuilderPreviewBindingsFromFields({
			headline: {
				kind: 'richtext-inline',
				previewInMarkup: true,
				default: 'Headline'
			},
			cta: {
				fields: {
					label: {
						previewInMarkup: true,
						default: 'Parliamone'
					}
				}
			},
			articles: {
				previewInMarkup: true,
				item: {
					fields: {
						title: {
							previewInMarkup: true,
							default: 'Nuovo articolo'
						},
						cover: {
							kind: 'image',
							default: '/cover.png',
							previewInMarkup: true,
							previewLabel: 'Sostituisci copertina'
						}
					}
				}
			}
		});

		expect(bindings).toEqual([
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
			},
			{
				type: 'text',
				selector: '[data-builder-field="articles[].title"]',
				path: 'articles[].title',
				label: undefined
			},
			{
				type: 'image',
				selector: '[data-builder-field="articles[].cover"]',
				path: 'articles[].cover',
				label: 'Sostituisci copertina'
			}
		]);
	});

	it('infers collection selectors from collection item paths', () => {
		const collections = createBuilderCollectionsFromFields({
			logos: {
				label: 'Loghi',
				itemLabel: 'Logo',
				summaryField: 'alt',
				previewInMarkup: true,
				item: {
					fields: {
						src: {
							kind: 'image',
							default: '/logo.png',
							previewInMarkup: true
						},
						alt: {
							default: 'Nuovo logo'
						}
					}
				}
			}
		});

		expect(collections).toEqual([
			{
				path: 'logos',
				label: 'Loghi',
				itemLabel: 'Logo',
				defaultItem: {
					src: '/logo.png',
					alt: 'Nuovo logo'
				},
				summaryField: 'alt',
				imageField: 'src',
				previewSelector: '[data-builder-collection-item="logos"]'
			}
		]);
	});

	it('hides fields marked as previewed in markup from the inspector', () => {
		const inspectorFields = createInspectorFieldsFromFields({
			headline: {
				previewInMarkup: true,
				default: 'Headline'
			},
			cta: {
				fields: {
					label: {
						previewInMarkup: true,
						default: 'Parliamone'
					},
					href: {
						default: '/contatti'
					}
				}
			},
			testimonials: {
				item: {
					fields: {
						avatar: {
							kind: 'image',
							default: '',
							previewInMarkup: true
						},
						initials: {
							default: 'AG'
						}
					}
				}
			}
		});

		expect(inspectorFields).toEqual({
			cta: {
				fields: {
					href: {
						default: '/contatti'
					}
				}
			},
			testimonials: {
				item: {
					fields: {
						initials: {
							default: 'AG'
						}
					}
				}
			}
		});
	});
});
