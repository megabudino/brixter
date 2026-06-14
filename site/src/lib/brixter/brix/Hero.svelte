<script module lang="ts">
	export const brikDescription = 'Primary hero with promise, subtitle, and CTA.';

	export const brikFields = {
		cta: {
			fields: {
				href: {
					default: '/admin'
				}
			}
		}
	};
</script>

<script lang="ts">
	interface Cta {
		href: string;
		label?: string;
		note?: string;
	}

	interface Props {
		eyebrow?: string;
		headline?: string;
		subtitle?: string;
		cta?: Cta;
		screenshot?: string;
	}

	const {
		eyebrow,
		headline,
		subtitle,
		cta,
		screenshot = '/product-screenshot.png'
	}: Props = $props();
</script>

<section class="bg-gray-50 px-6 py-24 md:py-32 dark:bg-gray-900">
	<div class="mx-auto max-w-2xl text-center">
		{#if eyebrow}
			<p
				class="text-muted mb-6 text-[11px] font-semibold tracking-wide uppercase"
				data-brixter-field="eyebrow"
			>
				{eyebrow}
			</p>
		{/if}

		<h1
			class="font-display text-heading text-5xl tracking-tight md:text-6xl"
			data-brixter-field="headline"
			data-brixter-kind="richtext-inline"
		>
			{@html headline ?? ''}
		</h1>

		{#if subtitle}
			<p
				class="text-secondary mx-auto mt-6 max-w-xl text-lg leading-8"
				data-brixter-field="subtitle"
				data-brixter-kind="richtext-inline"
			>
				{@html subtitle}
			</p>
		{/if}

		{#if cta}
			<div class="mt-10">
				<a href={cta.href} class="btn-site-primary" data-brixter-field="cta.label">
					{cta.label}
				</a>
				{#if cta.note}
					<p
						class="text-muted mt-4 text-sm"
						data-brixter-field="cta.note"
						data-brixter-kind="richtext-inline"
					>
						{@html cta.note}
					</p>
				{/if}
			</div>
		{/if}
	</div>

	{#if screenshot}
		<div class="mx-auto mt-16 max-w-5xl sm:mt-20">
			<img
				src={screenshot}
				alt="Product screenshot"
				class="w-full shadow-2xl ring-1 ring-gray-900/10 dark:ring-white/10"
				data-brixter-field="screenshot"
			/>
		</div>
	{/if}
</section>
