<script lang="ts">
	/**
	 * Renders standard SEO metadata into the document `<head>`.
	 *
	 * The brixter Vite plugin injects `<BrixSeo {...metadata} />` for every
	 * compiled `.brix.yaml` page, so the props mirror the `STANDARD_SEO_FIELDS`
	 * schema declared in `@brixter/brix-builder`.
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
</script>

<svelte:head>
	{#if title}<title>{title}</title>{/if}
	{#if description}<meta name="description" content={description} />{/if}
	{#if robots}<meta name="robots" content={robots} />{/if}
	{#if canonical}<link rel="canonical" href={canonical} />{/if}

	{#if og?.title}<meta property="og:title" content={og.title} />{/if}
	{#if og?.description}<meta property="og:description" content={og.description} />{/if}
	{#if og?.image}<meta property="og:image" content={og.image} />{/if}
	{#if og?.url}<meta property="og:url" content={og.url} />{/if}
	{#if og?.type}<meta property="og:type" content={og.type} />{/if}

	{#if twitter?.card}<meta name="twitter:card" content={twitter.card} />{/if}
	{#if twitter?.title}<meta name="twitter:title" content={twitter.title} />{/if}
	{#if twitter?.description}<meta name="twitter:description" content={twitter.description} />{/if}
	{#if twitter?.image}<meta name="twitter:image" content={twitter.image} />{/if}

	{#each jsonLdBlocks as block, index (index)}
		{@html `<script type="application/ld+json">${JSON.stringify(block)}<\/script>`}
	{/each}
</svelte:head>
