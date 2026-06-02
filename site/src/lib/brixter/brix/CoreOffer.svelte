<script module lang="ts">
	export const brikDescription = 'Core offer presentation with key points and CTA.';

	export const brikFields = {
		features: {
			label: 'Offer points',
			itemLabel: 'Point',
			summaryField: 'title',
			item: {
				fields: {
					icon: {
						kind: 'icon',
						default: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check"><path d="M20 6 9 17l-5-5"/></svg>'
					},
					title: {},
					text: {
						kind: 'richtext-inline'
					}
				}
			}
		},
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
	interface Feature {
		icon?: string;
		title?: string;
		text?: string;
	}

	interface Cta {
		href: string;
		label?: string;
	}

	interface Props {
		eyebrow?: string;
		headline?: string;
		description?: string;
		features?: Feature[];
		cta?: Cta;
	}

	const { eyebrow, headline, description, features = [], cta }: Props = $props();
</script>

<section class="bg-white px-6 py-20 dark:bg-gray-900">
	<div class="mx-auto grid max-w-5xl gap-10 md:grid-cols-[0.9fr_1.1fr] md:items-start">
		<div>
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

			{#if description}
				<p
					class="text-secondary mt-5 text-base leading-7"
					data-builder-field="description"
					data-builder-kind="richtext-inline"
				>
					{@html description}
				</p>
			{/if}

			{#if cta}
				<a
					href={cta.href}
					class="mt-8 inline-block max-w-full bg-[#FDE047] px-[24px] py-[15px] text-center font-sans text-base font-bold text-gray-900 shadow-md transition-all duration-200 ease-in-out hover:bg-[#FACC15] focus:ring-2 focus:ring-[#FDE047] focus:ring-offset-2 focus:ring-offset-white focus:outline-none active:translate-y-[2px] dark:bg-[#FDE047] dark:text-gray-900 dark:shadow-xl dark:hover:bg-[#FACC15] dark:focus:ring-[#FACC15] dark:focus:ring-offset-[#030712]"
					data-builder-field="cta.label"
				>
					{cta.label}
				</a>
			{/if}
		</div>

		<div class="border border-gray-300 bg-gray-50 dark:border-gray-700 dark:bg-gray-800">
			{#each features as feature}
				<div
					class="border-b border-gray-300 p-6 last:border-b-0 dark:border-gray-700"
					data-builder-collection-item="features"
				>
					<div class="flex items-start gap-3">
						<span
							class="h-5 w-5 mt-1 shrink-0 text-yellow-500 dark:text-yellow-400"
							data-builder-field="features[].icon"
							data-builder-kind="icon"
						>
							{@html feature.icon ?? ''}
						</span>
						<div>
							<h3
								class="text-heading text-lg font-semibold"
								data-builder-field="features[].title"
							>
								{feature.title}
							</h3>
							<p
								class="text-secondary mt-2 text-sm leading-6"
								data-builder-field="features[].text"
								data-builder-kind="richtext-inline"
							>
								{@html feature.text ?? ''}
							</p>
						</div>
					</div>
				</div>
			{/each}
		</div>
	</div>
</section>
