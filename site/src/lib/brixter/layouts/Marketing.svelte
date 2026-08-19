<script lang="ts">
	/**
	 * A page layout.
	 *
	 * Layouts receive three things from a compiled `+page.md`: `metadata` (the
	 * frontmatter's `metadata` block), `children` (the page's briks, in order),
	 * and `content` — the markdown body of the page, already compiled to HTML.
	 *
	 * `content` is what lets a page carry editorial prose alongside its briks:
	 * the layout decides where that prose sits and how it is styled, while the
	 * page itself just writes markdown under its frontmatter.
	 */
	let {
		metadata = {},
		content = '',
		children
	}: {
		metadata?: Record<string, unknown>;
		content?: string;
		children?: import('svelte').Snippet;
	} = $props();
</script>

{@render children?.()}

{#if content}
	<article class="prose mx-auto max-w-2xl px-6 py-16 dark:prose-invert">
		{@html content}
	</article>
{/if}
