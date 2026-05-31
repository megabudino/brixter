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
	}

	const { eyebrow, headline, subtitle, cta }: Props = $props();
</script>

<section class="bg-gray-50 px-6 py-24 dark:bg-gray-900 md:py-32">
	<div class="mx-auto max-w-2xl text-center">
		{#if eyebrow}
			<p
				class="text-muted mb-6 text-[11px] font-semibold tracking-wide uppercase"
				data-builder-field="eyebrow"
			>
				{eyebrow}
			</p>
		{/if}

		<h1
			class="font-display text-heading text-5xl tracking-tight md:text-6xl"
			data-builder-field="headline"
			data-builder-kind="richtext-inline"
		>
			{@html headline ?? ''}
		</h1>

		{#if subtitle}
			<p
				class="text-secondary mx-auto mt-6 max-w-xl text-lg leading-8"
				data-builder-field="subtitle"
				data-builder-kind="richtext-inline"
			>
				{@html subtitle}
			</p>
		{/if}

		{#if cta}
			<div class="mt-10">
				<a
					href={cta.href}
					class="inline-block max-w-full bg-[#2563EB] px-[24px] py-[15px] text-center font-sans text-base font-bold text-white shadow-md transition-all duration-200 ease-in-out hover:bg-[#3B82F6] focus:ring-2 focus:ring-[#2563EB] focus:ring-offset-2 focus:ring-offset-white focus:outline-none active:translate-y-[2px] dark:bg-[#3B82F6] dark:text-gray-100 dark:shadow-xl dark:hover:bg-[#2563EB] dark:focus:ring-[#3B82F6] dark:focus:ring-offset-[#030712]"
					data-builder-field="cta.label"
				>
					{cta.label}
				</a>
				{#if cta.note}
					<p
						class="text-muted mt-4 text-sm"
						data-builder-field="cta.note"
						data-builder-kind="richtext-inline"
					>
						{@html cta.note}
					</p>
				{/if}
			</div>
		{/if}
	</div>
</section>
