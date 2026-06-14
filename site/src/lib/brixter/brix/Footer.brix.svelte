<script module lang="ts">
	export const brikDescription = 'Minimal footer to close the landing page.';

	export const brikFields = {
		links: {
			label: 'Links',
			itemLabel: 'Link',
			summaryField: 'label',
			item: {
				fields: {
					href: {
						default: '/'
					}
				}
			}
		}
	};
</script>

<footer class="border-t border-gray-300 bg-white px-6 py-10 dark:border-gray-700 dark:bg-gray-900">
	<div class="mx-auto flex max-w-5xl flex-col gap-6 md:flex-row md:items-center md:justify-between">
		<div>
			<p class="text-heading font-display text-2xl" data-brixter-field="brand">Brand</p>
			<p class="text-muted mt-2 text-sm" data-brixter-field="claim">Claim</p>
		</div>

		<nav class="flex flex-wrap gap-4 text-sm">
			<a
				href="#"
				class="text-secondary hover:text-heading transition-colors"
				data-brixter-collection-item="links"
				data-brixter-field="links[].label"
				data-brixter-bind="href:links[].href"
			>
				Link label
			</a>
		</nav>
	</div>
</footer>