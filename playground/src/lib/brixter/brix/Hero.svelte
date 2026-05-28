<script module lang="ts">
	export const brikFields = {
		scarcity: {
			label: 'Badge scarsita',
			default: false
		},
		cta: {
			label: 'Call to action',
			fields: {
				href: {
					label: 'Link bottone',
					default: '/raccontami-il-tuo-progetto'
				}
			}
		},
		logoSrc: {
			kind: 'image',
			label: 'Logo',
			default: ''
		},
		logoAlt: {
			label: 'Alt logo',
			default: 'Logo'
		},
		illustrationSrc: {
			kind: 'image',
			label: 'Illustrazione',
			default: ''
		},
		illustrationAlt: {
			label: 'Alt illustrazione',
			default: 'Illustration'
		}
	};

	export const brikDescription =
		'Hero principale con headline, sottotitolo, badge opzionale e call to action.';
</script>

<script lang="ts">
	interface HeroCta {
		href: string;
		label: string;
		note?: string;
	}

	interface HeroProps {
		headline?: string;
		subtitle?: string;
		scarcity?: boolean;
		cta?: HeroCta;
		logoSrc?: string;
		logoAlt?: string;
		brandName?: string;
		illustrationSrc?: string;
		illustrationAlt?: string;
	}

	const {
		headline,
		subtitle,
		scarcity,
		cta,
		logoSrc,
		logoAlt = 'Logo',
		brandName = 'Zeromega',
		illustrationSrc,
		illustrationAlt = 'Illustration'
	}: HeroProps = $props();
</script>

<div
	class="background relative min-h-screen w-full overflow-hidden bg-[#111827] bg-cover bg-center bg-no-repeat py-[16px] text-white md:py-[32px]"
>
	<div class="elipse-gradient"></div>
	<div
		class="items-left my-auto flex min-h-[calc(100vh_-_32px)] flex-col items-center justify-center gap-[32px] px-8 text-left text-center md:min-h-[calc(100vh_-_64px)] lg:gap-[64px]"
	>
		<div class="relative z-10 mx-auto flex w-fit items-center gap-4 lg:mx-0">
			{#if logoSrc}
				<img
					src={logoSrc}
					alt={logoAlt}
					class="relative top-[2px] w-[17px]"
					data-builder-field="logoSrc"
					data-builder-preview-label="Sostituisci logo"
				/>
			{/if}
			<p
				class="font-mono text-[20px] font-thin text-gray-400"
				data-builder-field="brandName"
				data-builder-default="Zeromega"
			>
				{brandName}
			</p>
		</div>
		{#if illustrationSrc}
			<div
				class="relative z-10 flex w-full max-w-[350px] justify-start sm:max-w-[380px] sm:justify-end"
			>
				<img
					src={illustrationSrc}
					alt={illustrationAlt}
					class="w-full max-w-[350px]"
					data-builder-field="illustrationSrc"
					data-builder-preview-label="Sostituisci illustrazione"
				/>
			</div>
		{/if}
		<h1
			class="w-full font-display md:!leading-normal text-4xl text-gray-100 md:text-6xl lg:text-6xl xl:w-[60%] xl:text-6xl 2xl:text-7xl"
			data-builder-field="headline"
			data-builder-default="Il tuo sito puo fare molto di piu">
			{headline}
		</h1>
		<p
			class="relative z-10 mx-auto max-w-[350px] font-sans text-sm text-gray-400 sm:max-w-[480px] sm:text-lg/8 lg:mx-0 xl:w-[55%]"
			data-builder-field="subtitle"
			data-builder-kind="richtext-inline"
			data-builder-default="Il sito aziendale non deve essere <em>solo un biglietto da visita</em>. Trasformiamolo in una <strong>macchina di crescita</strong>.">
			{@html subtitle}
		</p>
		<div class="flex flex-col items-center justify-center gap-4 sm:mt-10">
			{#if scarcity}
				<div class="relative z-10 inline-flex items-center px-3 py-1 text-sm font-semibold text-white">
					<span class="relative mr-2 flex h-2 w-2">
						<span class="absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
						<span class="relative inline-flex h-2 w-2 rounded-full bg-green-500"></span>
					</span>
					Disponibile per 5 nuovi progetti
				</div>
			{/if}
			{#if cta}
				<div class="w-full max-w-[750px]">
					<a
						href={cta.href}
						class="relative z-10 inline-block w-[350px] max-w-full bg-[#3B82F6] py-[15px] text-center font-sans text-base font-bold text-gray-100 shadow-xl hover:bg-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#3B82F6] focus:ring-offset-2 focus:ring-offset-[#030712]"
						data-builder-field="cta.label"
						data-builder-default="Raccontami il tuo progetto"
					>
						{cta.label}
					</a>
					{#if cta.note}
						<p
							class="mt-4 text-xs text-gray-400 opacity-80"
							data-builder-field="cta.note"
							data-builder-kind="richtext-inline"
						>
							{@html cta.note}
						</p>
					{/if}
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	.background {
		background-image: url('/shape-grid.png');
		background-repeat: repeat;
	}

	.elipse-gradient {
		position: absolute;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		width: 100vmax;
		border-radius: 50%;
		background: radial-gradient(50% 50% at 50% 50%, #111827 50%, rgba(17, 24, 39, 0) 100%);
		aspect-ratio: 1;
		z-index: 0;
	}
</style>
