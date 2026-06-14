<script module lang="ts">
	export const brikDescription = 'Team section or project signature.';

	export const brikFields = {
		members: {
			label: 'Members',
			itemLabel: 'Member',
			summaryField: 'name',
			item: {
				fields: {}
			}
		}
	};
</script>

<section class="bg-white px-6 py-20 dark:bg-gray-900">
	<div class="mx-auto max-w-5xl">
		<div class="grid gap-8 md:grid-cols-[0.8fr_1.2fr] md:items-end">
			<div>
				<p
					class="text-muted mb-3 text-[11px] font-semibold tracking-wide uppercase"
					data-brixter-field="eyebrow"
					data-brixter-default="Team"
				>
					Team
				</p>

				<h2
					class="font-display text-heading text-3xl md:text-4xl"
					data-brixter-field="headline"
					data-brixter-kind="richtext-inline"
					data-brixter-default="Built for people who live between product, code, and content."
				>
					Built for people who live between product, code, and content.
				</h2>
			</div>

			<p
				class="text-secondary text-base leading-7"
				data-brixter-field="description"
				data-brixter-kind="richtext-inline"
				data-brixter-default="Brixter removes friction from marketing pages without turning your project into an opaque platform."
			>
				Brixter removes friction from marketing pages without turning your project into an opaque platform.
			</p>
		</div>

		<div class="mt-12 grid gap-4 md:grid-cols-3">
			<article
				class="border border-gray-300 bg-gray-50 p-6 dark:border-gray-700 dark:bg-gray-800"
				data-brixter-collection-item="members"
			>
				<h3 class="text-heading text-lg font-semibold" data-brixter-field="members[].name" data-brixter-default="Developer">
					Developer
				</h3>
				<p class="text-muted mt-1 text-sm" data-brixter-field="members[].role" data-brixter-default="Components and repository">
					Components and repository
				</p>
				<p
					class="text-secondary mt-4 text-sm leading-6"
					data-brixter-field="members[].bio"
					data-brixter-kind="richtext-inline"
					data-brixter-default="Defines briks, maintains the design system, and reviews changes like regular code."
				>
					Defines briks, maintains the design system, and reviews changes like regular code.
				</p>
			</article>
		</div>
	</div>
</section>