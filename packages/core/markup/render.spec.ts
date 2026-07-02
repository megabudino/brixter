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

describe('render — precompiled AST', () => {
	it('renders from a parsed AST without re-parsing', () => {
		const ast = parseTemplate('<p data-brixter-field="x">_</p>');
		expect(render(ast, { x: 'a' })).toBe('<p data-brixter-field="x">a</p>');
		expect(render(ast, { x: 'b' })).toBe('<p data-brixter-field="x">b</p>');
	});
});
