<script module lang="ts">
	export const brikDescription = 'Short bridge statement between problem and offer.';
</script>

<script lang="ts">
	interface Props {
		statement?: string;
		note?: string;
	}

	const { statement, note }: Props = $props();
</script>

<section class="bg-gray-50 px-6 py-16 dark:bg-gray-900">
	<div class="mx-auto max-w-2xl border-y border-gray-300 py-12 text-center dark:border-gray-700">
		<h2
			class="font-display text-heading text-3xl md:text-4xl"
			data-brixter-field="statement"
			data-brixter-kind="richtext-inline"
		>
			{@html statement ?? ''}
		</h2>

		{#if note}
			<p
				class="text-secondary mx-auto mt-5 max-w-xl text-base leading-7"
				data-brixter-field="note"
				data-brixter-kind="richtext-inline"
			>
				{@html note}
			</p>
		{/if}
	</div>
</section>
