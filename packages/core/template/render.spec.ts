import { describe, expect, it } from 'vitest';
import { parseTemplate } from './parser.js';
import { render, renderBrikSource, renderToString } from './render.js';

/** Render without editor anchors, to assert on the markup itself. */
const plain = (template: string, props: Record<string, unknown> = {}) =>
	renderToString(template, props, { editorAnchors: false });

describe('static markup', () => {
	it('passes through untouched', () => {
		const template = '<section class="hero"><p>Static copy.</p></section>';

		expect(plain(template)).toBe(template);
	});

	it('preserves attribute order, casing and boolean attributes', () => {
		expect(plain('<input Type="text" required disabled>')).toBe(
			'<input Type="text" required disabled>'
		);
	});

	it('keeps comments and void elements', () => {
		expect(plain('<!-- note --><br><hr/>')).toBe('<!-- note --><br><hr>');
	});
});

describe('interpolation', () => {
	it('replaces an interpolation with the prop value', () => {
		expect(plain('<h1>{headline}</h1>', { headline: 'Ship pages' })).toBe('<h1>Ship pages</h1>');
	});

	it('escapes text values', () => {
		expect(plain('<p>{note}</p>', { note: '<b>&</b>' })).toBe('<p>&lt;b&gt;&amp;&lt;/b&gt;</p>');
	});

	it('reads a dotted path', () => {
		expect(plain('<a>{cta.label}</a>', { cta: { label: 'Go' } })).toBe('<a>Go</a>');
	});

	it('renders nothing for a missing value', () => {
		expect(plain('<p>{missing}</p>')).toBe('<p></p>');
	});

	it('interpolates alongside static text', () => {
		expect(plain('<p>Hi {name}, welcome.</p>', { name: 'Ada' })).toBe('<p>Hi Ada, welcome.</p>');
	});

	it('injects raw HTML for `@richtext` and `@icon`', () => {
		expect(plain('<h1>{@richtext headline}</h1>', { headline: 'Ship <em>pages</em>' })).toBe(
			'<h1>Ship <em>pages</em></h1>'
		);
		expect(plain('<span>{@icon glyph}</span>', { glyph: '<svg />' })).toBe('<span><svg /></span>');
	});

	it('renders a `{@prop}` declaration as nothing', () => {
		expect(plain('<p>{@prop @boolean autoplay ?? false}ok</p>')).toBe('<p>ok</p>');
	});
});

describe('`??` fallbacks', () => {
	it('applies when the prop is missing', () => {
		expect(plain("<p>{eyebrow ?? 'Pricing'}</p>")).toBe('<p>Pricing</p>');
	});

	it('applies when the prop is null or empty — an emptied field shows its placeholder', () => {
		expect(plain("<p>{eyebrow ?? 'Pricing'}</p>", { eyebrow: null })).toBe('<p>Pricing</p>');
		expect(plain("<p>{eyebrow ?? 'Pricing'}</p>", { eyebrow: '' })).toBe('<p>Pricing</p>');
	});

	it('yields to a real value', () => {
		expect(plain("<p>{eyebrow ?? 'Pricing'}</p>", { eyebrow: 'Plans' })).toBe('<p>Plans</p>');
	});

	it('renders non-string literals', () => {
		expect(plain('<p>{count ?? 12}</p>')).toBe('<p>12</p>');
		expect(plain('<p>{flag ?? false}</p>')).toBe('<p>false</p>');
	});
});

describe('attributes', () => {
	it('binds a whole attribute value', () => {
		expect(plain('<a href={cta.href}>Go</a>', { cta: { href: '/docs' } })).toBe(
			'<a href="/docs">Go</a>'
		);
	});

	it('interpolates inside a quoted value', () => {
		expect(plain('<div class="card {accent}">x</div>', { accent: 'blue' })).toBe(
			'<div class="card blue">x</div>'
		);
	});

	it('escapes quotes and ampersands in the value', () => {
		expect(plain('<a href={url}>x</a>', { url: '/a?b=1&c="2"' })).toBe(
			'<a href="/a?b=1&amp;c=&quot;2&quot;">x</a>'
		);
	});

	it('drops the attribute when a lone interpolation is absent or false', () => {
		expect(plain('<article data-featured={featured}>x</article>', { featured: false })).toBe(
			'<article>x</article>'
		);
		expect(plain('<article data-featured={featured}>x</article>')).toBe('<article>x</article>');
	});

	it('writes `true` as a value so attribute selectors match', () => {
		expect(plain('<article data-featured={featured}>x</article>', { featured: true })).toBe(
			'<article data-featured="true">x</article>'
		);
	});

	it('applies a fallback in attribute position', () => {
		expect(plain("<a href={cta.href ?? '#'}>x</a>")).toBe('<a href="#">x</a>');
	});

	it('does not let a `>` inside an expression close the tag', () => {
		expect(plain("<p data-label={label ?? 'a > b'}>x</p>")).toBe('<p data-label="a > b">x</p>');
	});
});

describe('style attributes', () => {
	it('drops only the declaration whose value is missing', () => {
		const template = '<img style="object-fit: cover; object-position: {position};">';

		expect(plain(template)).toBe('<img style="object-fit: cover;">');
	});

	it('keeps the declaration when the value resolves', () => {
		const template = '<img style="object-fit: cover; object-position: {position};">';

		expect(plain(template, { position: '50% 20%' })).toBe(
			'<img style="object-fit: cover; object-position: 50% 20%;">'
		);
	});

	it('drops the whole attribute when nothing survives', () => {
		expect(plain('<img style="object-position: {position};">')).toBe('<img>');
	});

	it('supports custom properties', () => {
		expect(plain('<div style="--accent: {accent};">x</div>', { accent: 'red' })).toBe(
			'<div style="--accent: red;">x</div>'
		);
	});

	it('neutralises characters that would break out of the declaration', () => {
		expect(plain('<div style="color: {value};">x</div>', { value: 'red; background: url(<x)' })).toBe(
			'<div style="color: red background: url(x);">x</div>'
		);
	});

	it('keeps quotes and parens so `url("…")` survives', () => {
		expect(plain('<div style="background: {bg};">x</div>', { bg: 'url("/a.png")' })).toBe(
			'<div style="background: url(&quot;/a.png&quot;);">x</div>'
		);
	});
});

describe('{#each}', () => {
	const template = '<ul>{#each items as item}<li>{item.label}</li>{/each}</ul>';

	it('repeats its body once per entry', () => {
		expect(plain(template, { items: [{ label: 'One' }, { label: 'Two' }] })).toBe(
			'<ul><li>One</li><li>Two</li></ul>'
		);
	});

	it('renders nothing for a missing or empty collection', () => {
		expect(plain(template)).toBe('<ul></ul>');
		expect(plain(template, { items: [] })).toBe('<ul></ul>');
	});

	it('renders a collection of scalars through the alias itself', () => {
		expect(plain('<ul>{#each tags as tag}<li>{tag}</li>{/each}</ul>', { tags: ['a', 'b'] })).toBe(
			'<ul><li>a</li><li>b</li></ul>'
		);
	});

	it('exposes the index binding', () => {
		expect(
			plain('{#each items as item, i}<li>{i}:{item}</li>{/each}', { items: ['a', 'b'] })
		).toBe('<li>0:a</li><li>1:b</li>');
	});

	it('nests, with each alias scoped to its own block', () => {
		const nested =
			'{#each plans as plan}<section>{plan.name}{#each plan.tiers as tier}<b>{tier.label}</b>{/each}</section>{/each}';

		expect(
			plain(nested, {
				plans: [
					{ name: 'Pro', tiers: [{ label: 'S' }, { label: 'M' }] },
					{ name: 'Max', tiers: [{ label: 'L' }] }
				]
			})
		).toBe('<section>Pro<b>S</b><b>M</b></section><section>Max<b>L</b></section>');
	});

	it('still reads page-level props from inside the block', () => {
		expect(plain('{#each items as item}<li>{prefix}{item}</li>{/each}', {
			prefix: '#',
			items: ['a']
		})).toBe('<li>#a</li>');
	});
});

describe('{#if}', () => {
	it('renders the branch when the test is truthy', () => {
		expect(plain('{#if badge}<b>{badge}</b>{/if}', { badge: 'New' })).toBe('<b>New</b>');
	});

	it('renders nothing when it is not', () => {
		expect(plain('{#if badge}<b>x</b>{/if}')).toBe('');
		expect(plain('{#if badge}<b>x</b>{/if}', { badge: '' })).toBe('');
	});

	it('treats an empty collection as falsy', () => {
		expect(plain('{#if items}<b>x</b>{/if}', { items: [] })).toBe('');
		expect(plain('{#if items}<b>x</b>{/if}', { items: [1] })).toBe('<b>x</b>');
	});

	it('takes the else branch', () => {
		expect(plain('{#if a}<b>A</b>{:else}<b>B</b>{/if}')).toBe('<b>B</b>');
	});

	it('chains else-if branches in order', () => {
		const template = "{#if tier == 'pro'}P{:else if tier == 'max'}M{:else}F{/if}";

		expect(plain(template, { tier: 'pro' })).toBe('P');
		expect(plain(template, { tier: 'max' })).toBe('M');
		expect(plain(template, { tier: 'free' })).toBe('F');
	});

	it('negates', () => {
		expect(plain('{#if !hidden}<b>x</b>{/if}')).toBe('<b>x</b>');
		expect(plain('{#if !hidden}<b>x</b>{/if}', { hidden: true })).toBe('');
	});

	it('compares numbers', () => {
		expect(plain('{#if count >= 3}<b>x</b>{/if}', { count: 3 })).toBe('<b>x</b>');
		expect(plain('{#if count >= 3}<b>x</b>{/if}', { count: 2 })).toBe('');
	});
});

describe('editor anchors', () => {
	it('marks an element whose whole content is one interpolation', () => {
		expect(renderToString('<h1>{headline}</h1>', { headline: 'Hi' })).toBe(
			'<h1 data-brixter-field="headline" data-brixter-kind="text">Hi</h1>'
		);
	});

	it('carries the annotated kind', () => {
		expect(renderToString('<h1>{@richtext headline}</h1>', { headline: 'Hi' })).toContain(
			'data-brixter-kind="richtext"'
		);
	});

	it('leaves mixed content unmarked', () => {
		expect(renderToString('<p>Hi {name}</p>', { name: 'Ada' })).toBe('<p>Hi Ada</p>');
	});

	it('marks the sole element of an `{#each}` as the collection item', () => {
		expect(
			renderToString('<ul>{#each items as item}<li>{item.label}</li>{/each}</ul>', {
				items: [{ label: 'One' }]
			})
		).toBe(
			'<ul><li data-brixter-collection-item="items" data-brixter-field="items[].label" data-brixter-kind="text">One</li></ul>'
		);
	});

	it('resolves aliases to canonical paths, including nested ones', () => {
		const output = renderToString(
			'{#each plans as plan}<section>{#each plan.tiers as tier}<b>{tier.label}</b>{/each}</section>{/each}',
			{ plans: [{ tiers: [{ label: 'S' }] }] }
		);

		expect(output).toContain('data-brixter-collection-item="plans"');
		expect(output).toContain('data-brixter-collection-item="plans[].tiers"');
		expect(output).toContain('data-brixter-field="plans[].tiers[].label"');
	});

	it('does not mark an `{#each}` whose body is more than one element', () => {
		const output = renderToString('{#each items as item}<li>{item}</li><li>x</li>{/each}', {
			items: ['a']
		});

		expect(output).not.toContain('data-brixter-collection-item');
	});

	it('can be turned off', () => {
		expect(renderToString('<h1>{headline}</h1>', { headline: 'Hi' }, { editorAnchors: false })).toBe(
			'<h1>Hi</h1>'
		);
	});
});

describe('renderBrikSource', () => {
	it('renders the body and ignores the frontmatter', () => {
		const source = '---\ntitle: Hero\ndescription: The hero.\n---\n<h1>{headline}</h1>';

		expect(renderBrikSource(source, { headline: 'Hi' }, { editorAnchors: false })).toBe(
			'<h1>Hi</h1>'
		);
	});

	it('renders a file with no frontmatter at all', () => {
		expect(renderBrikSource('<h1>{headline}</h1>', { headline: 'Hi' }, { editorAnchors: false })).toBe(
			'<h1>Hi</h1>'
		);
	});
});

describe('precompiled AST', () => {
	it('renders a parsed template repeatedly', () => {
		const nodes = parseTemplate('<p>{name}</p>');

		expect(render(nodes, { name: 'A' }, { editorAnchors: false })).toBe('<p>A</p>');
		expect(render(nodes, { name: 'B' }, { editorAnchors: false })).toBe('<p>B</p>');
	});
});
