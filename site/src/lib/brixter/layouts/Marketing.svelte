<script lang="ts">
	/**
	 * A page layout.
	 *
	 * Layouts receive three things from a compiled `+page.md`: `metadata` (the
	 * frontmatter's `metadata` block, which this one does not need — `<BrixSeo>`
	 * already renders it into `<head>`), `children` (the page's briks, in order),
	 * and `content` — the markdown body of the page, already compiled to HTML.
	 *
	 * `content` is what lets a page carry editorial prose alongside its briks:
	 * the layout decides where that prose sits and how it is styled, while the
	 * page itself just writes markdown under its frontmatter.
	 */
	let {
		content = '',
		children
	}: {
		content?: string;
		children?: import('svelte').Snippet;
	} = $props();
</script>

{@render children?.()}

{#if content}
	<article class="prose dark:prose-invert mx-auto max-w-2xl px-6 py-16">
		<!--
			The body is markdown from this repository, compiled at build time — the
			same trust model as every other file the site is built from. It never
			carries user input.
		-->
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		{@html content}
	</article>
{/if}
