<script module lang="ts">
	export const brikFields = {
		cta: {
			label: 'Call to action',
			fields: {
				href: {
					label: 'Link bottone',
					default: '/raccontami-il-tuo-progetto'
				}
			}
		},
		note: {
			kind: 'richtext-inline',
			label: 'Nota',
			default: ''
		}
	};

	export const brikDescription = 'Call to action finale con headline, sottotitolo e bottone principale.';
</script>

<script lang="ts">
	const { headline, subtitle, cta, note } = $props();
</script>

<div class="bg-blue-700">
	<div class="px-6 py-24 sm:px-6 sm:py-32 lg:px-8">
		<div class="mx-auto max-w-2xl text-center">
			{#if headline}
				<h2
					class="text-balance font-display text-4xl text-white sm:text-5xl"
					data-builder-field="headline"
					data-builder-kind="richtext-inline"
					data-builder-default="Basta compromessi. E ora di avere il sito web che il tuo business merita."
				>
					{@html headline}
				</h2>
			{/if}
			{#if subtitle}
				<p
					class="mx-auto mt-6 max-w-xl text-pretty text-lg/8 text-blue-200"
					data-builder-field="subtitle"
					data-builder-kind="richtext-inline"
					data-builder-default="Affidati a uno sviluppatore che si prende cura della tua presenza online, cosi tu puoi tornare a fare cio che sai fare meglio: occuparti della tua azienda."
				>
					{@html subtitle}
				</p>
			{/if}
			{#if cta}
				<div class="mt-10 flex items-center justify-center gap-x-6">
					<a
						href={cta.href}
						class="relative z-10 inline-block w-[350px] max-w-full bg-gray-200 py-[15px] text-center font-sans text-base font-bold text-gray-900 shadow-xl hover:bg-white focus:outline-none focus:ring-2 focus:ring-[#3B82F6] focus:ring-offset-2 focus:ring-offset-[#030712]"
						data-builder-field="cta.label"
						data-builder-default="Raccontami il tuo progetto"
					>
						{cta.label}
					</a>
				</div>
			{/if}
			{#if note}
				<p
					class="mt-4 text-sm text-gray-300"
					data-builder-field="note"
					data-builder-kind="richtext-inline"
				>
					{@html note}
				</p>
			{/if}
		</div>
	</div>
</div>
