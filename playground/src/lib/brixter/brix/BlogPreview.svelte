<script module lang="ts">
	export const brikFields = {
		articles: {
			item: {
				fields: {
					href: {
						label: 'Link',
						default: '/nuovo-articolo'
					}
				}
			}
		}
	};

	export const brikDefaults = {
		articles: [
			{
				title: 'Da WordPress a uno stack moderno (senza buttare tutto)',
				description:
					'Lo sapevi che un sito di marketing puo cambiare motore senza cambiare carrozzeria? Il tempo di risposta migliora facilmente di 10 volte.',
				href: '/da-wordpress-a-uno-stack-moderno'
			}
		]
	};

	export const brikDescription = 'Anteprima blog con titolo sezione e lista di articoli.';
</script>

<script lang="ts">
	interface Article {
		title: string;
		description: string;
		href: string;
	}

	const { headline, articles }: { headline: string; articles: Article[] } = $props();
</script>

<section class="bg-gray-900 py-24 sm:py-32">
	<div class="mx-auto max-w-7xl px-6 lg:px-8">
		<div class="mb-12 text-center">
			<h2
				class="font-display text-4xl text-gray-100 sm:text-5xl"
				data-builder-field="headline"
				data-builder-kind="richtext-inline"
				data-builder-default="Dal blog"
			>
				{@html headline}
			</h2>
		</div>
		<div class="mt-10 grid gap-8 max-w-md mx-auto">
			{#each articles as article}
				<a
					href={article.href}
					class="group border border-gray-800 p-6 hover:border-gray-600"
					data-builder-collection-item="articles"
				>
					<h3
						class="font-display text-xl text-white group-hover:text-primary-400"
						data-builder-field="articles[].title"
						data-builder-default="Nuovo articolo"
					>
						{article.title}
					</h3>
					<p
						class="mt-3 line-clamp-3 text-sm text-gray-400"
						data-builder-field="articles[].description"
						data-builder-default="Aggiungi una descrizione sintetica."
					>
						{article.description}
					</p>
					<span class="mt-4 inline-block text-sm font-semibold text-primary-400">
						Leggi l'articolo →
					</span>
				</a>
			{/each}
		</div>
	</div>
</section>
