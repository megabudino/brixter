<script module lang="ts">
	export const brikDescription = 'Lush orange-themed Hero section specifically designed for showcasing premium citrus harvests.';

	export const brikFields = {
		cta: {
			fields: {
				href: {
					default: '/shop'
				}
			}
		},
		benefits: {
			label: 'Key benefits',
			itemLabel: 'Benefit',
			summaryField: 'text',
			item: {
				fields: {
					text: {}
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

	interface Benefit {
		text?: string;
	}

	interface Props {
		eyebrow?: string;
		headline?: string;
		subtitle?: string;
		cta?: Cta;
		image?: string;
		benefits?: Benefit[];
	}

	const {
		eyebrow = 'Premium Citrus Harvest',
		headline = 'Sun-Kissed Premium Mandarins Delivered Fresh',
		subtitle = 'Hand-picked at peak ripeness from sun-drenched Sicilian groves and shipped directly to your door in 48 hours. Experience the real, vibrant taste of natural citrus.',
		cta = {
			href: '/shop',
			label: 'Order a Fresh Box Today',
			note: '100% money-back freshness guarantee'
		},
		image = '/fresh-mandarins.png',
		benefits = [
			{ text: '100% Organic & Pesticide-Free' },
			{ text: 'Picked & shipped same day' },
			{ text: 'Carbon-neutral farm-to-table delivery' }
		]
	}: Props = $props();
</script>

<section class="relative overflow-hidden bg-gradient-to-br from-orange-50 via-amber-50 to-orange-100/50 px-6 py-20 md:py-28 dark:from-gray-950 dark:via-gray-900 dark:to-orange-950/15">
	<!-- Background decorative circle -->
	<div class="absolute -top-40 -right-40 h-80 w-80 rounded-full bg-orange-300/20 blur-3xl dark:bg-orange-500/10"></div>
	<div class="absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-amber-200/20 blur-3xl dark:bg-amber-500/5"></div>

	<div class="relative mx-auto max-w-5xl">
		<div class="grid items-center gap-12 md:grid-cols-[1.1fr_0.9fr]">
			<!-- Content Left -->
			<div>
				{#if eyebrow}
					<span
						class="inline-flex items-center gap-1.5 rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold tracking-wide text-orange-800 uppercase dark:bg-orange-950/40 dark:text-orange-300"
						data-builder-field="eyebrow"
					>
						🍊 {eyebrow}
					</span>
				{/if}

				<h1
					class="font-display text-heading mt-6 text-4xl tracking-tight leading-tight md:text-5xl lg:text-6xl"
					data-builder-field="headline"
					data-builder-kind="richtext-inline"
				>
					{@html headline ?? ''}
				</h1>

				{#if subtitle}
					<p
						class="text-secondary mt-6 text-base leading-relaxed md:text-lg"
						data-builder-field="subtitle"
						data-builder-kind="richtext-inline"
					>
						{@html subtitle}
					</p>
				{/if}

				<!-- Benefits checklist -->
				{#if benefits && benefits.length > 0}
					<div class="mt-8 space-y-3">
						{#each benefits as benefit}
							<div
								class="flex items-center gap-2"
								data-builder-collection-item="benefits"
							>
								<svg
									class="h-5 w-5 shrink-0 text-orange-600 dark:text-orange-400"
									xmlns="http://www.w3.org/2000/svg"
									viewBox="0 0 20 20"
									fill="currentColor"
								>
									<path
										fill-rule="evenodd"
										d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
										clip-rule="evenodd"
									/>
								</svg>
								<span
									class="text-secondary text-sm font-medium"
									data-builder-field="benefits[].text"
								>
									{benefit.text}
								</span>
							</div>
						{/each}
					</div>
				{/if}

				<!-- CTA -->
				{#if cta}
					<div class="mt-10">
						<a
							href={cta.href}
							class="inline-block rounded-xl bg-orange-600 px-6 py-3.5 text-center font-sans text-base font-bold text-white shadow-lg shadow-orange-500/20 transition-all duration-200 hover:-translate-y-0.5 hover:bg-orange-500 hover:shadow-orange-500/30 focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:ring-offset-white dark:bg-orange-500 dark:hover:bg-orange-400 dark:focus:ring-orange-400 dark:focus:ring-offset-gray-950"
							data-builder-field="cta.label"
						>
							{cta.label}
						</a>
						{#if cta.note}
							<p
								class="text-muted mt-4 text-xs tracking-wide"
								data-builder-field="cta.note"
								data-builder-kind="richtext-inline"
							>
								{@html cta.note}
							</p>
						{/if}
					</div>
				{/if}
			</div>

			<!-- Image Right -->
			{#if image}
				<div class="relative mx-auto w-full max-w-md md:max-w-none">
					<!-- Soft glow behind image -->
					<div class="absolute inset-0 rounded-3xl bg-orange-500/10 blur-2xl dark:bg-orange-500/5"></div>
					<div class="relative overflow-hidden rounded-3xl border border-orange-100 bg-white p-2 shadow-2xl transition-transform duration-500 hover:scale-[1.02] dark:border-gray-800 dark:bg-gray-900">
						<img
							src={image}
							alt="Fresh mandarins in a rustic basket"
							class="aspect-square w-full rounded-2xl object-cover"
							data-builder-field="image"
						/>
					</div>
				</div>
			{/if}
		</div>
	</div>
</section>
