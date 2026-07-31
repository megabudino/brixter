<script lang="ts">
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import {
		DEFAULT_THEME_PREFERENCE,
		readStoredThemePreference,
		resolveThemePreference,
		themePreference,
		type ThemePreference,
		writeStoredThemePreference
	} from './theme';

	let { root = null }: { root?: HTMLElement | null } = $props();

	let preference = $state<ThemePreference>(
		browser ? readStoredThemePreference() : DEFAULT_THEME_PREFERENCE
	);
	let systemDark = $state(
		browser ? window.matchMedia('(prefers-color-scheme: dark)').matches : false
	);
	const dark = $derived(resolveThemePreference(preference, systemDark));

	onMount(() => {
		const media = window.matchMedia('(prefers-color-scheme: dark)');
		themePreference.set(preference);
		systemDark = media.matches;

		const unsubscribe = themePreference.subscribe((value) => {
			preference = value;
			writeStoredThemePreference(value);
		});
		const updateSystemTheme = () => (systemDark = media.matches);

		media.addEventListener('change', updateSystemTheme);
		return () => {
			unsubscribe();
			media.removeEventListener('change', updateSystemTheme);
		};
	});

	$effect(() => {
		if (!browser || !root) return;
		root.classList.toggle('dark', dark);
		root.style.colorScheme = dark ? 'dark' : 'light';
	});
</script>
