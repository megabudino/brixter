<script lang="ts">
	import { onMount } from 'svelte';
	import '../layout.css';
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();

	onMount(() => {
		const media = window.matchMedia('(prefers-color-scheme: dark)');
		const applyTheme = () => {
			document.documentElement.classList.toggle('dark', media.matches);
			document.body.classList.toggle('dark', media.matches);
		};

		applyTheme();
		media.addEventListener('change', applyTheme);

		return () => {
			media.removeEventListener('change', applyTheme);
			document.documentElement.classList.remove('dark');
			document.body.classList.remove('dark');
		};
	});
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<!-- Site chrome (navbar, footer, etc.) -->
{@render children()}
