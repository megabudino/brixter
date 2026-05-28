<script module lang="ts">
	export const brikFields = {
		logos: {
			item: {
				fields: {
					alt: {
						label: 'Alt logo',
						default: 'Nuovo logo'
					}
				}
			}
		}
	};

	export const brikDefaults = {
		logos: [
			{
				src: '/images/clients-logos/edoria-vision.png',
				alt: 'Edoria Vision'
			},
			{
				src: '/images/clients-logos/logo-italianteacher.png',
				alt: 'Italian Teacher'
			},
			{
				src: '/images/clients-logos/studio-gallimberti.png',
				alt: 'Studio Gallimberti'
			},
			{
				src: '/images/clients-logos/logo-selene.png',
				alt: 'Selene'
			},
			{
				src: '/images/clients-logos/scuolaseriate.png',
				alt: 'Scuola Seriate'
			}
		]
	};

	export const brikDescription = 'Griglia di loghi clienti con titolo opzionale.';
</script>

<script lang="ts">
	const { title, logos } = $props();
</script>

<div class="bg-[#111827] py-16 sm:py-20">
	<div class="mx-auto max-w-7xl px-6 lg:px-8">
		{#if title}
			<div class="mb-12 text-center">
				<h2
					class="font-display text-4xl text-gray-100 sm:text-5xl"
					data-builder-field="title"
					data-builder-kind="richtext-inline"
					data-builder-default="I clienti con cui sto lavorando"
				>
					{@html title}
				</h2>
			</div>
		{/if}
		<div
			class="grid grid-cols-2 items-center justify-items-center gap-8 sm:grid-cols-3 lg:grid-cols-5"
		>
			{#each logos as logo}
				<div class="w-full" data-builder-collection-item="logos">
					<img
						src={logo.src}
						alt={logo.alt}
						class="h-16 max-w-[120px] w-full object-contain grayscale brightness-0 invert sm:h-20 sm:max-w-[160px]"
						data-builder-field="logos[].src"
						data-builder-default="/images/clients-logos/logo-placeholder.png"
						data-builder-preview-label="Sostituisci logo"
					/>
				</div>
			{/each}
		</div>
	</div>
</div>
