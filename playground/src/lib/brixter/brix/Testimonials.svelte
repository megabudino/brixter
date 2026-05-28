<script module lang="ts">
	export const brikFields = {
		testimonials: {
			item: {
				fields: {
					stars: {
						label: 'Stelle',
						kind: 'number',
						default: 5
					}
				}
			}
		}
	};

	export const brikDefaults = {
		testimonials: [
			{
				quote:
					"Davide e un professionista eccezionale, e gia questo basterebbe per consigliarlo, ma quello che lo caratterizza oltre a preparazione ed esperienza di altissimo livello, e l'approccio al cliente dal punto di vista del rapporto umano che e molto difficile trovare al giorno d'oggi. Gli interventi tecnici che ha fatto sul sito hanno migliorato la sua indicizzazione in maniera radicale. In una parola CONSIGLIATISSIMO!",
				name: 'Alberto Terraneo',
				avatar: '/images/reviews-avatars/alberto-terraneo.png',
				company: 'Metodo Gallimberti',
				stars: 5
			},
			{
				quote:
					'Uno delle poche agenzie italiane a seguirti in maniera costante e seria, il nostro sito ha avuto degli incrementi importanti soprattutto grazie alla competenza tecnica di Davide, Grazie ancora e che la collaborazione continui a lungo!!!',
				name: 'Matteo Luigi Giordani',
				avatar: '/images/reviews-avatars/matteo-luigi-giordani.png',
				company: 'Metodo Gallimberti',
				stars: 5
			},
			{
				quote:
					'Davide e stato eccezionale nel realizzare il mio sito web e una fantastica landing page. Inoltre mi ha guidato nel percorso di crescita della mia azienda.',
				name: 'Cristiano Carchidi',
				company: 'Italian Teacher',
				avatar: '/images/reviews-avatars/italianteacher.png',
				stars: 5
			},
			{
				quote:
					'Ringraziamo il nostro consulente tecnico che si occupa del nostro sito per la gestione efficiente',
				name: 'Wilma Sonzogni',
				company: 'Centro Medico Selene',
				avatar: '/images/cliente-zeromega-selene-centro-medico-bergamo.png',
				stars: 5
			},
			{
				quote:
					'Super in gamba e disponibile anche ad orari impossibili 😂👍🏼<br />Per non parlare di quanto e figo il sito che ha realizzato ⭐️',
				name: 'Dylan Betelli',
				company: 'Independence Ltd.',
				avatar: '/images/cliente-zeromega-independence-lnd-ltd-logo.jpg',
				stars: 5
			},
			{
				quote:
					'Davide ha creato per me un sito-portfolio pazzesco: veloce e curato in ogni dettaglio ✨',
				name: 'Alice Galizzi',
				company: 'Pittrice',
				initials: 'AG',
				stars: 5
			},
			{
				quote: 'Ottimo! Assistenza al cliente sempre disponibile e immediata. Consigliato.',
				name: 'Andre',
				company: 'Circolino della Malpensata',
				avatar: '/images/cliente-zeromega-circolino-della-malpensata-bergamo-logo.jpg',
				stars: 5
			},
			{
				quote: 'Velocissimo, sempre disponibile.',
				name: 'Giulia Nikitina',
				company: 'Bar Posto al Sole',
				avatar: '/images/cliente-zeromega-bar-posto-al-sole-bergamo-logo.webp',
				stars: 5
			}
		]
	};

	export const brikDescription = 'Sezione testimonials con cards, avatar opzionali e rating a stelle.';
</script>

<script lang="ts">
	const { headline, subtitle, testimonials } = $props();

	const starPath =
		'M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z';
</script>

<section class="background relative overflow-hidden bg-[#111827] py-24 sm:py-32">
	<div class="relative z-10 mx-auto max-w-7xl px-6 lg:px-8">
		<div class="mx-auto max-w-2xl lg:text-center">
			{#if headline}
				<p
					class="mt-2 font-display text-4xl text-white sm:text-5xl"
					data-builder-field="headline"
					data-builder-kind="richtext-inline"
					data-builder-default="La loro tranquillita e la mia metrica di successo"
				>
					{@html headline}
				</p>
			{/if}
			{#if subtitle}
				<p
					class="mt-6 text-lg leading-8 text-gray-400"
					data-builder-field="subtitle"
					data-builder-kind="richtext-inline"
					data-builder-default=""
				>
					{@html subtitle}
				</p>
			{/if}
		</div>

		<div class="mx-auto mt-16 max-w-2xl lg:mx-0 lg:max-w-none">
			<div class="columns-1 gap-8 sm:columns-2 lg:columns-3">
				{#each testimonials as t}
					<figure
						class="mb-8 break-inside-avoid bg-white/5 p-8 text-sm leading-6 shadow-lg ring-1 ring-white/10"
						data-builder-collection-item="testimonials">
						<blockquote class="text-gray-300">
							<p
								data-builder-field="testimonials[].quote"
								data-builder-kind="richtext-inline"
								data-builder-default="Nuova testimonianza"
							>
								{@html t.quote}
							</p>
						</blockquote>
						{#if t.stars}
							<div class="mt-4 flex items-center">
								<div class="flex items-center">
									{#each Array(t.stars) as _}
										<svg
											class="h-5 w-5 text-yellow-400"
											fill="currentColor"
											viewBox="0 0 20 20"
											aria-hidden="true"
										>
											<path d={starPath} />
										</svg>
									{/each}
								</div>
							</div>
						{/if}
						<figcaption class="mt-6 flex items-center gap-x-4">
							{#if t.avatar}
								<img
									class="h-10 w-10 rounded-full bg-gray-500 object-cover"
									src={t.avatar}
									alt=""
									data-builder-field="testimonials[].avatar"
									data-builder-preview-label="Sostituisci avatar"
								/>
							{:else if t.initials}
								<div
									class="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-white"
									data-builder-field="testimonials[].initials"
									data-builder-default="AG"
									aria-hidden="true"
								>
									{t.initials}
								</div>
							{/if}
							<div>
								<div
									class="font-semibold text-white"
									data-builder-field="testimonials[].name"
									data-builder-default="Nuovo cliente"
								>
									{t.name}
								</div>
								{#if t.company}
									<div
										class="text-gray-400"
										data-builder-field="testimonials[].company"
										data-builder-default="Azienda"
									>
										{t.company}
									</div>
								{/if}
							</div>
						</figcaption>
					</figure>
				{/each}
			</div>
		</div>
	</div>
</section>

<style>
	.background {
		background-image:
			linear-gradient(
				to right,
				rgba(17, 24, 39, 0) 0%,
				rgba(17, 24, 39, 0.92) 22%,
				rgba(17, 24, 39, 0.92) 78%,
				rgba(17, 24, 39, 0) 100%
			),
			url('/shape-grid.png');
		background-repeat: no-repeat, repeat;
		background-size: 100% 100%, auto;
		background-position: center, center;
	}

	@media (max-width: 640px) {
		.background {
			background-image:
				linear-gradient(
					to right,
					rgba(17, 24, 39, 0) 0%,
					rgba(17, 24, 39, 0.96) 16%,
					rgba(17, 24, 39, 0.96) 84%,
					rgba(17, 24, 39, 0) 100%
				),
				url('/shape-grid.png');
		}
	}
</style>
