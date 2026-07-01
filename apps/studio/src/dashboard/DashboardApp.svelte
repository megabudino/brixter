<script lang="ts">
	import { page as pageStore } from '$app/stores';
	import { Compass, Sun, Moon, Monitor, Image as ImageIcon, Users } from 'lucide-svelte';
	import LoginPage from './pages/LoginPage.svelte';
	import SetupPage from './pages/SetupPage.svelte';
	import ConfigErrorPage from './pages/ConfigErrorPage.svelte';
	import AccountsPage from './pages/AccountsPage.svelte';
	import RoutesPage from './pages/RoutesPage.svelte';
	import PublishPage from './pages/PublishPage.svelte';
	import MediaPage from './pages/MediaPage.svelte';
	import {
		ThemeController,
		themePreference,
		themePreferenceLabels,
		themePreferences,
		type ThemePreference
	} from 'brixter';

	let { data, form } = $props();

	let root = $state<HTMLElement | null>(null);

	const isLocal = $derived(data.isLocal === true);
	const currentPath = $derived($pageStore.url.pathname);
	const currentPublicPath = $derived(currentPath as string);
	const routesActive = $derived(
		currentPublicPath === '/admin' || currentPublicPath.startsWith('/admin/routes')
	);
	const mediaActive = $derived(
		currentPublicPath === '/admin/media' || currentPublicPath.startsWith('/admin/media/')
	);
	const accountsActive = $derived(
		currentPublicPath === '/admin/accounts' || currentPublicPath.startsWith('/admin/accounts/')
	);
	const pageData = $derived({ ...(data.pageData ?? {}) });

	const themeIcons: Record<ThemePreference, typeof Sun> = {
		light: Sun,
		dark: Moon,
		system: Monitor
	};
</script>

<svelte:head>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link
		rel="stylesheet"
		href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&display=swap"
	/>
</svelte:head>

{#snippet renderPage()}
	{#if data.page === 'login'}
		<LoginPage {form} notice={pageData.notice ?? ''} />
	{:else if data.page === 'setup'}
		<SetupPage {form} />
	{:else if data.page === 'config-error'}
		<ConfigErrorPage issues={pageData.issues ?? []} />
	{:else if data.page === 'accounts'}
		<AccountsPage data={pageData} {form} />
	{:else if data.page === 'branch'}
		<RoutesPage data={pageData} {form} />
	{:else if data.page === 'publish'}
		<PublishPage data={pageData} {form} />
	{:else if data.page === 'media'}
		<MediaPage data={pageData} {form} />
	{/if}
{/snippet}

<div class="brixter-root min-h-svh bg-gray-50 dark:bg-gray-900" bind:this={root}>
	<ThemeController {root} />
	{#if data.showNav}
		<div class="flex">
			<aside
				class="sticky top-0 flex h-svh w-56 shrink-0 flex-col border-r border-gray-300 bg-white px-3 py-6 dark:border-gray-700 dark:bg-gray-800"
			>
				<p class="bx-font-brand mb-6 px-3 text-4xl leading-none text-black dark:text-yellow-300">
					Brixter
				</p>
				<nav class="space-y-1">
					<a
						href="/admin/routes"
						class="flex items-center gap-2 px-3 py-2 text-sm transition-colors {routesActive
							? 'bx-text-heading font-medium'
							: 'bx-text-secondary hover:bx-text-heading'}"
					>
						<Compass size={16} /> Routes
					</a>
					<a
						href="/admin/media"
						class="flex items-center gap-2 px-3 py-2 text-sm transition-colors {mediaActive
							? 'bx-text-heading font-medium'
							: 'bx-text-secondary hover:bx-text-heading'}"
					>
						<ImageIcon size={16} /> Media
					</a>
					<a
						href="/admin/accounts"
						class="flex items-center gap-2 px-3 py-2 text-sm transition-colors {accountsActive
							? 'bx-text-heading font-medium'
							: 'bx-text-secondary hover:bx-text-heading'}"
					>
						<Users size={16} /> Accounts
					</a>
				</nav>
				<div class="mt-auto px-3 pt-6">
					<span class="bx-text-muted mb-2 block px-1 text-xs font-medium">Theme</span>
					<div
						class="flex items-center gap-0.5 rounded-full bg-gray-100 p-0.5 dark:bg-gray-900"
						role="radiogroup"
						aria-label="Theme"
					>
						{#each themePreferences as option}
							{@const Icon = themeIcons[option]}
							<button
								type="button"
								role="radio"
								aria-checked={$themePreference === option}
								title={themePreferenceLabels[option]}
								onclick={() => themePreference.set(option)}
								class="flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-full px-2 py-1.5 text-xs font-medium transition-colors {$themePreference ===
								option
									? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100'
									: 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}"
							>
								<Icon size={14} />
								<span class="sr-only">{themePreferenceLabels[option]}</span>
							</button>
						{/each}
					</div>
				</div>
			</aside>
			<main class="min-w-0 flex-1">
				{#if isLocal}
					<div
						class="flex items-center justify-center gap-2 bg-yellow-100 px-4 py-2 text-sm font-medium text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200"
					>
						Local mode - changes are written directly to the filesystem and are not published to GitHub.
					</div>
				{/if}
				{@render renderPage()}
			</main>
		</div>
	{:else}
		{@render renderPage()}
	{/if}
</div>
