<script lang="ts">
	/**
	 * Renders standard SEO metadata into the document `<head>`.
	 *
	 * The brixter Vite plugin injects `<BrixSeo {...metadata} />` for every
	 * compiled `+page.md`, so the props mirror the `PAGE_METADATA_SCHEMA`
	 * schema declared in `@brixter/core`.
	 */
	interface OpenGraph {
		title?: string;
		description?: string;
		image?: string;
		url?: string;
		type?: string;
	}

	interface TwitterCard {
		card?: string;
		title?: string;
		description?: string;
		image?: string;
	}

	import { page } from '$app/stores';

	let {
		title,
		description,
		canonical,
		robots,
		og,
		twitter,
		jsonLd
	}: {
		title?: string;
		description?: string;
		canonical?: string;
		robots?: string;
		og?: OpenGraph;
		twitter?: TwitterCard;
		jsonLd?: unknown;
	} = $props();

	const jsonLdBlocks = $derived(
		jsonLd == null ? [] : Array.isArray(jsonLd) ? jsonLd.filter(Boolean) : [jsonLd]
	);

	/**
	 * `JSON.stringify` leaves `<` untouched, so any string in a page's `jsonLd`
	 * frontmatter containing a literal closing script tag would end this block
	 * early and let whatever follows it execute. Escaping `<` as the `\u003c` JSON
	 * escape — which parses back to the same value — makes it unrepresentable.
	 */
	function serializeJsonLd(block: unknown): string {
		return JSON.stringify(block).replace(/</g, '\\u003c');
	}

	/**
	 * Social crawlers (og:image, twitter:image, og:url) fetch the page out of
	 * context and don't resolve relative paths, so they need absolute URLs.
	 * Root-relative values (e.g. `/images/og.png` from the media picker) are
	 * resolved against the request origin — under adapter-node this is the
	 * `ORIGIN` env. Already-absolute and protocol-relative URLs pass through.
	 */
	function absolutize(value: string | undefined): string | undefined {
		if (!value || !value.startsWith('/') || value.startsWith('//')) return value;
		const origin = $page.url.origin;
		return origin ? `${origin}${value}` : value;
	}

	const ogImage = $derived(absolutize(og?.image));
	const ogUrl = $derived(absolutize(og?.url));
	const twitterImage = $derived(absolutize(twitter?.image));
	const canonicalUrl = $derived(absolutize(canonical));
</script>

<svelte:head>
	{#if title}<title>{title}</title>{/if}
	{#if description}<meta name="description" content={description} />{/if}
	{#if robots}<meta name="robots" content={robots} />{/if}
	{#if canonicalUrl}<link rel="canonical" href={canonicalUrl} />{/if}

	{#if og?.title}<meta property="og:title" content={og.title} />{/if}
	{#if og?.description}<meta property="og:description" content={og.description} />{/if}
	{#if ogImage}<meta property="og:image" content={ogImage} />{/if}
	{#if ogUrl}<meta property="og:url" content={ogUrl} />{/if}
	{#if og?.type}<meta property="og:type" content={og.type} />{/if}

	{#if twitter?.card}<meta name="twitter:card" content={twitter.card} />{/if}
	{#if twitter?.title}<meta name="twitter:title" content={twitter.title} />{/if}
	{#if twitter?.description}<meta name="twitter:description" content={twitter.description} />{/if}
	{#if twitterImage}<meta name="twitter:image" content={twitterImage} />{/if}

	{#each jsonLdBlocks as block, index (index)}
		<!--
			A script element cannot be written as markup inside svelte:head, so
			{@html} is the only way to emit one. The payload is escaped by
			serializeJsonLd, and the escaped closing tag below keeps a literal one
			out of the compiled module in case that module is inlined into a script.
		-->
		<!-- eslint-disable-next-line svelte/no-at-html-tags, no-useless-escape -->
		{@html `<script type="application/ld+json">${serializeJsonLd(block)}<\/script>`}
	{/each}
</svelte:head>
