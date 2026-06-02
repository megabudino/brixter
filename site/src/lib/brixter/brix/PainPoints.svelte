<script module lang="ts">
	export const brikDescription = 'Section with three reasons or frictions that lead to the solution.';

	export const brikFields = {
		points: {
			label: 'Points',
			itemLabel: 'Point',
			summaryField: 'title',
			item: {
				fields: {
					title: {},
					text: {
						kind: 'richtext-inline'
					}
				}
			}
		}
	};
</script>

<script lang="ts">
	interface PainPoint {
		title?: string;
		text?: string;
	}

	interface Props {
		eyebrow?: string;
		headline?: string;
		points?: PainPoint[];
	}

	const { eyebrow, headline, points = [] }: Props = $props();
</script>

<section class="bg-white px-6 py-20 dark:bg-gray-900">
	<div class="mx-auto max-w-5xl">
		<div class="mx-auto max-w-2xl text-center">
			{#if eyebrow}
				<p
					class="text-muted mb-3 text-[11px] font-semibold tracking-wide uppercase"
					data-builder-field="eyebrow"
				>
					{eyebrow}
				</p>
			{/if}

			<h2
				class="font-display text-heading text-3xl md:text-4xl"
				data-builder-field="headline"
				data-builder-kind="richtext-inline"
			>
				{@html headline ?? ''}
			</h2>
		</div>

		<div class="mt-12 grid gap-4 md:grid-cols-3">
			{#each points as point}
				<article
					class="border border-gray-300 bg-gray-50 p-6 dark:border-gray-700 dark:bg-gray-800"
					data-builder-collection-item="points"
				>
					<h3
						class="text-heading text-lg font-semibold"
						data-builder-field="points[].title"
					>
						{point.title}
					</h3>
					<p
						class="text-secondary mt-3 text-sm leading-6"
						data-builder-field="points[].text"
						data-builder-kind="richtext-inline"
					>
						{@html point.text ?? ''}
					</p>
				</article>
			{/each}
		</div>
	</div>
</section>
