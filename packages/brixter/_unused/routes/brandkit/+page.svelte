<script lang="ts">
	import { Sun, Moon } from 'lucide-svelte';
	import Manifesto from '$lib/shared-content/manifesto.svx';

	import { browser } from '$app/environment';

	let dark = $state(browser ? document.body.classList.contains('dark') : true);

	$effect(() => {
		document.body.classList.toggle('dark', dark);
	});
</script>

<div class="min-h-svh bg-gray-50 dark:bg-gray-900">
	<div class="flex justify-end p-4">
		<button
			onclick={() => (dark = !dark)}
			class="rounded-full p-2 text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-50"
			aria-label="Toggle dark mode"
		>
			{#if dark}
				<Sun size={20} />
			{:else}
				<Moon size={20} />
			{/if}
		</button>
	</div>
	<div class="max-w-[65ch] mx-auto mb-24 px-6">
		<h1
			class="mx-auto mb-6 py-6 lg:mb-8 lg:py-8 font-display text-5xl lg:text-6xl text-gray-900 italic dark:text-gray-50"
		>
			gitmattr.
		</h1>
		<div class="mx-auto prose prose-lg lg:prose-xl dark:prose-invert">
			<Manifesto />
		</div>
	</div>
</div>
