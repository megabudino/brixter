<script module lang="ts">
	export const brikDescription = 'Final CTA for the landing page.';

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
		headline?: string;
		subtitle?: string;
		cta?: Cta;
	}

	const { headline, subtitle, cta }: Props = $props();
</script>

<section class="bg-gray-50 px-6 py-20 dark:bg-gray-900">
	<div
		class="mx-auto max-w-5xl border border-gray-300 bg-white px-6 py-12 text-center md:px-12 dark:border-gray-700 dark:bg-gray-900"
	>
		<h2
			class="font-display text-heading mx-auto max-w-2xl text-3xl md:text-4xl"
			data-builder-field="headline"
			data-builder-kind="richtext-inline"
		>
			{@html headline ?? ''}
		</h2>

		{#if subtitle}
			<p
				class="text-secondary mx-auto mt-5 max-w-xl text-base leading-7"
				data-builder-field="subtitle"
				data-builder-kind="richtext-inline"
			>
				{@html subtitle}
			</p>
		{/if}

		{#if cta}
			<div class="mt-8">
				<a href={cta.href} class="btn-site-primary" data-builder-field="cta.label">
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
