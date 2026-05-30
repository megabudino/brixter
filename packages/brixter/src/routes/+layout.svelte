<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { PUBLIC_DEBUG } from '$env/static/public';
	import { Sun, Moon } from 'lucide-svelte';
	import { browser } from '$app/environment';

	let { children } = $props();

	const debug = PUBLIC_DEBUG === 'true';

	let dark = $state(browser ? document.body.classList.contains('dark') : true);

	$effect(() => {
		document.body.classList.toggle('dark', dark);
	});
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
{#if debug}
	<div class="fixed bottom-4 left-4 z-50">
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
{/if}
{@render children()}
