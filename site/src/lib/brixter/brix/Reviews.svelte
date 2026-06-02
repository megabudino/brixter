<script module lang="ts">
	export const brikDescription = 'Reviews and social proof section.';

	export const brikFields = {
		reviews: {
			label: 'Reviews',
			itemLabel: 'Review',
			summaryField: 'author',
			item: {
				fields: {
					quote: {
						kind: 'richtext-inline'
					},
					author: {},
					role: {}
				}
			}
		}
	};
</script>

<script lang="ts">
	interface Review {
		quote?: string;
		author?: string;
		role?: string;
	}

	interface Props {
		eyebrow?: string;
		headline?: string;
		reviews?: Review[];
	}

	const { eyebrow, headline, reviews = [] }: Props = $props();
</script>

<section class="bg-gray-50 px-6 py-20 dark:bg-gray-900">
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
			{#each reviews as review}
				<figure
					class="border border-gray-300 bg-white p-6 dark:border-gray-700 dark:bg-gray-800"
					data-builder-collection-item="reviews"
				>
					<blockquote
						class="text-secondary text-sm leading-6"
						data-builder-field="reviews[].quote"
						data-builder-kind="richtext-inline"
					>
						{@html review.quote ?? ''}
					</blockquote>
					<figcaption class="mt-6">
						<p
							class="text-heading text-sm font-semibold"
							data-builder-field="reviews[].author"
						>
							{review.author}
						</p>
						<p class="text-muted mt-1 text-xs" data-builder-field="reviews[].role">
							{review.role}
						</p>
					</figcaption>
				</figure>
			{/each}
		</div>
	</div>
</section>
