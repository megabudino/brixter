<script module lang="ts">
	export const brikDescription = 'Reviews and social proof section.';

	export const brikFields = {
		reviews: {
			label: 'Reviews',
			itemLabel: 'Review',
			summaryField: 'author',
			item: {
				fields: {}
			}
		}
	};
</script>

<section class="bg-gray-50 px-6 py-20 dark:bg-gray-900">
	<div class="mx-auto max-w-5xl">
		<div class="mx-auto max-w-2xl text-center">
			<p
				class="text-muted mb-3 text-[11px] font-semibold tracking-wide uppercase"
				data-brixter-field="eyebrow"
				data-brixter-default="Social proof"
			>
				Social proof
			</p>

			<h2
				class="font-display text-heading text-3xl md:text-4xl"
				data-brixter-field="headline"
				data-brixter-kind="richtext-inline"
				data-brixter-default="Built for teams that refuse to choose between speed and control."
			>
				Built for teams that refuse to choose between speed and control.
			</h2>
		</div>

		<div class="mt-12 grid gap-4 md:grid-cols-3">
			<figure
				class="border border-gray-300 bg-white p-6 dark:border-gray-700 dark:bg-gray-800"
				data-brixter-collection-item="reviews"
			>
				<blockquote
					class="text-secondary text-sm leading-6"
					data-brixter-field="reviews[].quote"
					data-brixter-kind="richtext-inline"
					data-brixter-default="I can finally update a landing page without opening an issue for every headline."
				>
					I can finally update a landing page without opening an issue for every headline.
				</blockquote>
				<figcaption class="mt-6">
					<p
						class="text-heading text-sm font-semibold"
						data-brixter-field="reviews[].author"
						data-brixter-default="Marketing Lead"
					>
						Marketing Lead
					</p>
					<p class="text-muted mt-1 text-xs" data-brixter-field="reviews[].role" data-brixter-default="Growth team">
						Growth team
					</p>
				</figcaption>
			</figure>
		</div>
	</div>
</section>