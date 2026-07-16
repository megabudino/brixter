<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import { initBrixControllers } from 'brixter/controllers';
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();

	// Progressive enhancement for `.brix` markup: run every controller under
	// `$lib/brixter/controllers` after each client navigation, tearing down the
	// previous run first so listeners/observers never accumulate.
	let teardownControllers: () => void = () => {};
	afterNavigate(async () => {
		teardownControllers();
		await tick(); // let the freshly navigated markup render first
		teardownControllers = initBrixControllers();
	});

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
			teardownControllers();
		};
	});
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<!-- Site chrome (navbar, footer, etc.) -->
{@render children()}
