import { describe, expect, it } from 'vitest';
import { inferBuilderFieldKind, render } from '@brixter/core';
import { createMarkupBrixDefinition, parseBrixFile } from './loader';

// Mirrors site/src/lib/brixter/brix/CoreOffer.brix.svelte as a plain `.brix` file:
// `<script module>` exports become YAML frontmatter, the markup body is unchanged.
const CORE_OFFER = `---
description: Core offer presentation with key points and CTA.
fields:
  features:
    label: Offer points
    itemLabel: Point
    summaryField: title
  cta:
    fields:
      href:
        default: /admin
---
<section class="bg-white">
  <p data-brixter-field="eyebrow">Eyebrow</p>
  <h2 data-brixter-field="headline" data-brixter-kind="richtext-inline">Headline goes here.</h2>
  <div data-brixter-collection-item="features">
    <span data-brixter-field="features[].icon" data-brixter-kind="icon"><svg></svg></span>
    <h3 data-brixter-field="features[].title">Feature title</h3>
  </div>
  <a href="#" data-brixter-field="cta.label" data-brixter-bind="href:cta.href">Get started</a>
</section>
`;

describe('parseBrixFile', () => {
	it('splits YAML frontmatter from the markup body', () => {
		const { frontmatter, body } = parseBrixFile(CORE_OFFER);
		expect(frontmatter.description).toBe('Core offer presentation with key points and CTA.');
		expect(body.trimStart().startsWith('<section')).toBe(true);
	});

	it('treats a file without frontmatter as pure body', () => {
		const { frontmatter, body } = parseBrixFile('<p data-brixter-field="x">x</p>');
		expect(frontmatter).toEqual({});
		expect(body).toBe('<p data-brixter-field="x">x</p>');
	});
});

describe('createMarkupBrixDefinition', () => {
	const def = createMarkupBrixDefinition('CoreOffer.brix', CORE_OFFER);

	it('derives type and description', () => {
		expect(def.type).toBe('CoreOffer');
		expect(def.description).toBe('Core offer presentation with key points and CTA.');
	});

	it('infers field kinds from markup and merges frontmatter overrides', () => {
		// Plain text fields store kind `undefined` (resolved to 'text' at runtime),
		// matching the existing markup-schema behavior.
		expect(def.fields.eyebrow && inferBuilderFieldKind(def.fields.eyebrow)).toBe('text');
		expect(def.fields.eyebrow?.default).toBe('Eyebrow');
		expect(def.fields.headline?.kind).toBe('richtext-inline');
		expect(def.fields.features?.kind).toBe('array');
		expect(def.fields.features?.label).toBe('Offer points');
		expect(def.fields.features?.item?.fields?.icon?.kind).toBe('icon');
		expect(def.fields.features?.item?.fields?.title).toBeTruthy();
		expect(def.fields.cta?.fields?.href?.default).toBe('/admin');
	});

	it('produces defaults, collections and preview bindings like the adapter', () => {
		expect(def.defaults.cta).toMatchObject({ href: '/admin' });
		expect(def.collections).toHaveLength(1);
		expect(def.collections[0]).toMatchObject({ path: 'features', label: 'Offer points' });
		expect(def.previewBindings.some((b) => b.path === 'headline' && b.type === 'richtext')).toBe(
			true
		);
	});

	it('renders the parsed template against props', () => {
		const html = render(def.template, {
			eyebrow: 'Why us',
			headline: '<em>Great</em>',
			cta: { label: 'Start', href: '/admin' },
			features: [
				{ icon: '<svg id="a"></svg>', title: 'Fast' },
				{ icon: '<svg id="b"></svg>', title: 'Safe' }
			]
		});

		expect(html).toContain('>Why us<');
		expect(html).toContain('<em>Great</em>');
		// Collection repeated per item, icon injected as raw HTML
		expect(html).toContain('<svg id="a"></svg>');
		expect(html).toContain('>Fast<');
		expect(html).toContain('>Safe<');
		// bind wrote the resolved href onto the anchor
		expect(html).toContain('href="/admin"');
	});
});
