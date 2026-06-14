<script module lang="ts">
	export const brikDescription = 'Team section or project signature.';

	export const brikFields = {
		members: {
			label: 'Members',
			itemLabel: 'Member',
			summaryField: 'name',
			item: {
				fields: {
					name: {},
					role: {},
					bio: {
						kind: 'richtext-inline'
					}
				}
			}
		}
	};
</script>

<script lang="ts">
	interface Member {
		name?: string;
		role?: string;
		bio?: string;
	}

	interface Props {
		eyebrow?: string;
		headline?: string;
		description?: string;
		members?: Member[];
	}

	const { eyebrow, headline, description, members = [] }: Props = $props();
</script>

<section class="bg-white px-6 py-20 dark:bg-gray-900">
	<div class="mx-auto max-w-5xl">
		<div class="grid gap-8 md:grid-cols-[0.8fr_1.2fr] md:items-end">
			<div>
				{#if eyebrow}
					<p
						class="text-muted mb-3 text-[11px] font-semibold tracking-wide uppercase"
						data-brixter-field="eyebrow"
					>
						{eyebrow}
					</p>
				{/if}

				<h2
					class="font-display text-heading text-3xl md:text-4xl"
					data-brixter-field="headline"
					data-brixter-kind="richtext-inline"
				>
					{@html headline ?? ''}
				</h2>
			</div>

			{#if description}
				<p
					class="text-secondary text-base leading-7"
					data-brixter-field="description"
					data-brixter-kind="richtext-inline"
				>
					{@html description}
				</p>
			{/if}
		</div>

		<div class="mt-12 grid gap-4 md:grid-cols-3">
			{#each members as member}
				<article
					class="border border-gray-300 bg-gray-50 p-6 dark:border-gray-700 dark:bg-gray-800"
					data-brixter-collection-item="members"
				>
					<h3 class="text-heading text-lg font-semibold" data-brixter-field="members[].name">
						{member.name}
					</h3>
					<p class="text-muted mt-1 text-sm" data-brixter-field="members[].role">
						{member.role}
					</p>
					<p
						class="text-secondary mt-4 text-sm leading-6"
						data-brixter-field="members[].bio"
						data-brixter-kind="richtext-inline"
					>
						{@html member.bio ?? ''}
					</p>
				</article>
			{/each}
		</div>
	</div>
</section>
