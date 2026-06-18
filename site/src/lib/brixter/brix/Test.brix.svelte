<script module lang="ts">
	export const brikDescription = 'Image gallery grid with captions for testing collection rendering.';

	export const brikFields = {
		images: {
			label: 'Gallery images',
			itemLabel: 'Image',
			summaryField: 'title',
			item: {
				fields: {}
			}
		}
	};
</script>

<section class="bg-white px-6 py-20 dark:bg-gray-900">
	<div class="mx-auto max-w-5xl">
		<div class="text-center">
			<p
				class="text-muted mb-3 text-[11px] font-semibold tracking-wide uppercase"
				data-brixter-field="eyebrow"
				data-brixter-default="Gallery"
			>
				Gallery
			</p>

			<h2
				class="font-display text-heading text-3xl md:text-4xl"
				data-brixter-field="headline"
				data-brixter-kind="richtext-inline"
				data-brixter-default="A beautiful collection of images."
			>
				A beautiful collection of images.
			</h2>

			<p
				class="text-secondary mx-auto mt-4 max-w-2xl text-base leading-7"
				data-brixter-field="description"
				data-brixter-kind="richtext-inline"
				data-brixter-default="Browse through this curated selection of visuals, each with its own title and caption."
			>
				Browse through this curated selection of visuals, each with its own title and caption.
			</p>
		</div>

		<div class="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
			<figure
				class="group overflow-hidden rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800"
				data-brixter-collection-item="images"
			>
				<div class="aspect-video overflow-hidden bg-gray-100 dark:bg-gray-700">
					<img
						class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
						data-brixter-field="images[].img"
						alt=""
					/>
				</div>
				<figcaption class="p-4">
					<h3
						class="text-heading text-base font-semibold"
						data-brixter-field="images[].title"
						data-brixter-default="Image title"
					>
						Image title
					</h3>
					<p
						class="text-secondary mt-1 text-sm leading-5"
						data-brixter-field="images[].caption"
						data-brixter-kind="richtext-inline"
						data-brixter-default="A short caption describing this image."
					>
						A short caption describing this image.
					</p>
				</figcaption>
			</figure>
		</div>
	</div>
</section>