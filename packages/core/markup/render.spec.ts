import { describe, expect, it } from 'vitest';
import { parseTemplate } from './parser';
import { render, renderBrixSource, renderToString, stripFrontmatter } from './render';

describe('renderBrixSource — frontmatter handling', () => {
	const file = `---\ndescription: x\nfields:\n  y: {}\n---\n<p data-brixter-field="title">t</p>`;

	it('strips a leading frontmatter block before rendering', () => {
		expect(stripFrontmatter(file)).toBe('<p data-brixter-field="title">t</p>');
		expect(renderBrixSource(file, { title: 'Hi' })).toBe(
			'<p data-brixter-field="title">Hi</p>'
		);
	});

	it('renders a frontmatter-less source unchanged', () => {
		expect(renderBrixSource('<p data-brixter-field="t">_</p>', { t: 'a' })).toBe(
			'<p data-brixter-field="t">a</p>'
		);
	});
});

describe('markup parser', () => {
	it('parses elements, attributes (incl. boolean) and text', () => {
		const [node] = parseTemplate('<a href="/x" data-flag class="b">Go</a>');
		expect(node).toMatchObject({
			type: 'element',
			name: 'a',
			attributes: [
				{ name: 'href', value: '/x' },
				{ name: 'data-flag', value: null },
				{ name: 'class', value: 'b' }
			]
		});
	});

	it('treats void elements as childless and keeps following siblings', () => {
		const nodes = parseTemplate('<img src="a.png"><p>after</p>');
		expect(nodes).toHaveLength(2);
		expect(nodes[0]).toMatchObject({ type: 'element', name: 'img', children: [] });
		expect(nodes[1]).toMatchObject({ type: 'element', name: 'p' });
	});

	it('preserves comments', () => {
		const [node] = parseTemplate('<!-- hi -->');
		expect(node).toEqual({ type: 'comment', value: ' hi ' });
	});
});

describe('renderToString — field substitution', () => {
	it('replaces text content with the prop value (escaped)', () => {
		const html = renderToString('<p data-brixter-field="eyebrow">Eyebrow</p>', {
			eyebrow: 'Hello <world>'
		});
		expect(html).toBe('<p data-brixter-field="eyebrow">Hello &lt;world&gt;</p>');
	});

	it('injects raw HTML for richtext/icon kinds', () => {
		const html = renderToString(
			'<h1 data-brixter-field="headline" data-brixter-kind="richtext-inline">x</h1>',
			{ headline: '<em>Hi</em>' }
		);
		expect(html).toBe(
			'<h1 data-brixter-field="headline" data-brixter-kind="richtext-inline"><em>Hi</em></h1>'
		);
	});

	it('rewrites img src and preserves data attributes', () => {
		const html = renderToString(
			'<img src="" alt="" data-brixter-field="screenshot" data-brixter-kind="image" />',
			{ screenshot: '/media/a.png' }
		);
		expect(html).toBe(
			'<img src="/media/a.png" alt="" data-brixter-field="screenshot" data-brixter-kind="image">'
		);
	});

	it('resolves nested object paths', () => {
		const html = renderToString('<a data-brixter-field="cta.label">x</a>', {
			cta: { label: 'Get started' }
		});
		expect(html).toBe('<a data-brixter-field="cta.label">Get started</a>');
	});

	it('renders empty string for missing values', () => {
		const html = renderToString('<p data-brixter-field="missing">x</p>', {});
		expect(html).toBe('<p data-brixter-field="missing"></p>');
	});
});

describe('renderToString — collections', () => {
	const template =
		'<ul><li data-brixter-collection-item="items"><h3 data-brixter-field="items[].title">t</h3></li></ul>';

	it('repeats the container per array entry, resolving item paths', () => {
		const html = renderToString(template, {
			items: [{ title: 'One' }, { title: 'Two' }]
		});
		expect(html).toBe(
			'<ul><li data-brixter-collection-item="items"><h3 data-brixter-field="items[].title">One</h3></li><li data-brixter-collection-item="items"><h3 data-brixter-field="items[].title">Two</h3></li></ul>'
		);
	});

	it('renders zero items (container disappears) for an empty/absent collection', () => {
		expect(renderToString(template, { items: [] })).toBe('<ul></ul>');
		expect(renderToString(template, {})).toBe('<ul></ul>');
	});
});

describe('renderToString — data-brixter-bind', () => {
	it('writes resolved values onto attributes, overriding existing ones', () => {
		const html = renderToString(
			'<a href="#" data-brixter-field="cta.label" data-brixter-bind="href:cta.href; target:cta.target">x</a>',
			{ cta: { label: 'Go', href: '/admin', target: '_blank' } }
		);
		expect(html).toBe(
			'<a href="/admin" data-brixter-field="cta.label" data-brixter-bind="href:cta.href; target:cta.target" target="_blank">Go</a>'
		);
	});

	it('resolves bind paths against the current collection item', () => {
		const html = renderToString(
			'<li data-brixter-collection-item="items" data-brixter-bind="data-href:items[].url"><span data-brixter-field="items[].title">t</span></li>',
			{ items: [{ title: 'A', url: '/a' }] }
		);
		expect(html).toContain('data-href="/a"');
		expect(html).toContain('>A<');
	});
});

describe('renderToString — data-brixter-bind style.<prop> merge', () => {
	it('overrides a single declaration in an existing style, preserving the rest', () => {
		const html = renderToString(
			'<img class="h-full w-full object-cover" style="object-position: 47.5% 50%; opacity: 0.9;" data-brixter-field="imageSrc" data-brixter-bind="alt: imageAlt; style.object-position: imagePosition" />',
			{ imageSrc: '/a.jpg', imageAlt: 'x', imagePosition: '50% 28%' }
		);
		expect(html).toBe(
			'<img class="h-full w-full object-cover" style="object-position: 50% 28%; opacity: 0.9;" data-brixter-field="imageSrc" data-brixter-bind="alt: imageAlt; style.object-position: imagePosition" src="/a.jpg" alt="x">'
		);
	});

	it('matches the acceptance-criteria example verbatim via renderBrixSource', () => {
		const html = renderBrixSource(
			'<img class="h-full w-full object-cover" style="object-position: 47.5% 50%;" data-brixter-field="imageSrc" data-brixter-bind="alt: imageAlt; style.object-position: imagePosition" />',
			{ imageSrc: '/a.jpg', imageAlt: 'x', imagePosition: '50% 28%' }
		);
		expect(html).toContain('src="/a.jpg"');
		expect(html).toContain('alt="x"');
		expect(html).toContain('style="object-position: 50% 28%;"');
	});

	it('adds a style attribute when the element has none', () => {
		const html = renderToString(
			'<img data-brixter-bind="style.object-position: pos" />',
			{ pos: '50% 28%' }
		);
		expect(html).toBe('<img data-brixter-bind="style.object-position: pos" style="object-position: 50% 28%;">');
	});

	it('merges a custom property (`--x`)', () => {
		const html = renderToString(
			'<div style="--op: 0%;" data-brixter-bind="style.--op: pos">x</div>',
			{ pos: '50% 28%' }
		);
		expect(html).toBe('<div style="--op: 50% 28%;" data-brixter-bind="style.--op: pos">x</div>');
	});

	it('does not emit the declaration for an empty/undefined value (static default stands)', () => {
		const empty = renderToString(
			'<img style="object-position: 47.5% 50%;" data-brixter-bind="style.object-position: pos" />',
			{ pos: '' }
		);
		expect(empty).toContain('style="object-position: 47.5% 50%;"');

		const missing = renderToString(
			'<img style="object-position: 47.5% 50%;" data-brixter-bind="style.object-position: pos" />',
			{}
		);
		expect(missing).toContain('style="object-position: 47.5% 50%;"');
	});

	it('does not add a style attribute when value is empty and no static style exists', () => {
		const html = renderToString('<img data-brixter-bind="style.object-position: pos" />', {
			pos: ''
		});
		expect(html).toBe('<img data-brixter-bind="style.object-position: pos">');
	});

	it('accumulates multiple style.* bindings on the same element', () => {
		const html = renderToString(
			'<div style="color: red;" data-brixter-bind="style.object-position: pos; style.--op: op">x</div>',
			{ pos: '50% 28%', op: 'blue' }
		);
		expect(html).toBe(
			'<div style="color: red; object-position: 50% 28%; --op: blue;" data-brixter-bind="style.object-position: pos; style.--op: op">x</div>'
		);
	});

	it('applies whole `style:` replace first, then merges style.<prop>', () => {
		const html = renderToString(
			'<div style="color: red;" data-brixter-bind="style: base; style.object-position: pos">x</div>',
			{ base: 'display: block; object-position: 0% 0%;', pos: '50% 28%' }
		);
		expect(html).toBe(
			'<div style="display: block; object-position: 50% 28%;" data-brixter-bind="style: base; style.object-position: pos">x</div>'
		);
	});

	it('resolves style.<prop> against the current collection item', () => {
		const html = renderToString(
			'<li data-brixter-collection-item="items" data-brixter-bind="style.--op: items[].pos"><span data-brixter-field="items[].title">t</span></li>',
			{ items: [{ title: 'A', pos: '10% 20%' }] }
		);
		expect(html).toContain('style="--op: 10% 20%;"');
		expect(html).toContain('>A<');
	});
});

describe('renderToString — data-brixter-bind style.<prop> escaping', () => {
	it('escapes double quotes so url("…") survives without breaking the attribute', () => {
		const html = renderToString(
			'<div data-brixter-bind="style.background-image: bg">x</div>',
			{ bg: 'url("/a.jpg")' }
		);
		expect(html).toBe(
			'<div data-brixter-bind="style.background-image: bg" style="background-image: url(&quot;/a.jpg&quot;);">x</div>'
		);
	});

	it('keeps single-quoted url() values intact', () => {
		const html = renderToString(
			"<div data-brixter-bind=\"style.background-image: bg\">x</div>",
			{ bg: "url('/a.jpg')" }
		);
		expect(html).toContain("style=\"background-image: url('/a.jpg');\"");
	});

	it('neutralises a declaration-injection breakout attempt', () => {
		const html = renderToString(
			'<div style="color: red;" data-brixter-bind="style.object-position: pos">x</div>',
			{ pos: '0 0; background: url(evil); }' }
		);
		// The `;` `{` `}` are stripped, so no extra declaration is injected.
		expect(html).toBe(
			'<div style="color: red; object-position: 0 0 background: url(evil);" data-brixter-bind="style.object-position: pos">x</div>'
		);
	});

	it('neutralises tag-breakout characters', () => {
		const html = renderToString(
			'<div data-brixter-bind="style.--x: v">x</div>',
			{ v: '</style><script>alert(1)</script>' }
		);
		expect(html).not.toContain('<script>');
		expect(html).toContain('style="--x: /stylescriptalert(1)/script;"');
	});
});

describe('renderToString — data-brixter-bind retro-compat', () => {
	it('leaves plain attr bindings unchanged', () => {
		const html = renderToString(
			'<a href="#" data-brixter-bind="href: cta.href; target: cta.target">x</a>',
			{ cta: { href: '/admin', target: '_blank' } }
		);
		expect(html).toBe(
			'<a href="/admin" data-brixter-bind="href: cta.href; target: cta.target" target="_blank">x</a>'
		);
	});

	it('leaves a whole `style:` replace unchanged (no static style preserved)', () => {
		const html = renderToString('<div data-brixter-bind="style: s">x</div>', {
			s: 'color: red'
		});
		expect(html).toBe('<div data-brixter-bind="style: s" style="color: red">x</div>');
	});

	it('leaves a whole `class:` replace unchanged', () => {
		const html = renderToString('<div class="a" data-brixter-bind="class: c">x</div>', {
			c: 'b'
		});
		expect(html).toBe('<div class="b" data-brixter-bind="class: c">x</div>');
	});
});

describe('render — precompiled AST', () => {
	it('renders from a parsed AST without re-parsing', () => {
		const ast = parseTemplate('<p data-brixter-field="x">_</p>');
		expect(render(ast, { x: 'a' })).toBe('<p data-brixter-field="x">a</p>');
		expect(render(ast, { x: 'b' })).toBe('<p data-brixter-field="x">b</p>');
	});
});
