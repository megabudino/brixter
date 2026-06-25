import { describe, expect, it } from 'vitest';
import { brixter } from './preprocess';

function run(content: string): string {
	const pre = brixter();
	const result = pre.markup({ content, filename: 'Test.brix.svelte' });
	return result ? result.code : content;
}

describe('brixter preprocessor — injected prop defaults', () => {
	it('injects empty-safe typed defaults for inferred props', () => {
		const code = run(`
<section>
	<p data-brixter-field="eyebrow">Eyebrow</p>
	<h2 data-brixter-field="title">Titolo</h2>
	<div data-brixter-collection-item="items">
		<h3 data-brixter-field="items[].title">Item</h3>
	</div>
</section>
`);

		expect(code).toContain("eyebrow = ''");
		expect(code).toContain("title = ''");
		// Collections default to [] so hand-written {#each items} never iterates undefined
		expect(code).toContain('items = []');
	});

	it('merges into an existing $props() without overriding author defaults', () => {
		const code = run(`
<script>
	let { columns = 3, mediaMode = false } = $props();
</script>
<section>
	<h2 data-brixter-field="title">Titolo</h2>
</section>
`);

		expect(code).toContain('columns = 3');
		expect(code).toContain('mediaMode = false');
		expect(code).toContain("title = ''");
		// No duplicate columns entry
		expect(code.match(/columns/g)?.length).toBe(1);
	});

	it('builds nested object defaults so deep access is safe', () => {
		const code = run(`
<section>
	<a data-brixter-field="cta.label">Get started</a>
	<span data-brixter-field="cta.note">note</span>
</section>
`);

		expect(code).toMatch(/cta = \{\s*label: '',\s*note: ''\s*\}/);
	});
});

describe('brixter preprocessor — markup defaults', () => {
	it('keeps static markup defaults in the generated schema without emitting data-brixter-default', () => {
		const code = run(`
<section>
	<h1 data-brixter-field="headline" data-brixter-kind="richtext-inline">Headline goes here.</h1>
</section>
`);

		expect(code).toContain('"default":"Headline goes here."');
		expect(code).not.toContain('data-brixter-default');
	});

	it('does not infer defaults when the markup already holds an expression', () => {
		const code = run(`
<section>
	<h2 data-brixter-field="title">{title}</h2>
</section>
`);

		expect(code).not.toContain('"default"');
		expect(code).not.toContain('data-brixter-default');
	});
});
