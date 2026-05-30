<script lang="ts">
	import { page as pageStore } from '$app/stores';
	import { GitBranch, Settings, Sun, Moon, Monitor } from 'lucide-svelte';
	import BranchesPage from './pages/BranchesPage.svelte';
	import LoginPage from './pages/LoginPage.svelte';
	import SetupPage from './pages/SetupPage.svelte';
	import NewBranchPage from './pages/NewBranchPage.svelte';
	import SettingsPage from './pages/SettingsPage.svelte';
	import BranchPage from './pages/BranchPage.svelte';
	import ThemeController from '../ThemeController.svelte';
	import {
		themePreference,
		themePreferenceLabels,
		themePreferences,
		type ThemePreference
	} from '../theme';

	let { data, form } = $props();

	const currentPath = $derived($pageStore.url.pathname);
	const currentPublicPath = $derived(currentPath as string);
	const pageData = $derived({ ...(data.pageData ?? {}), isAdmin: data.isAdmin });

	const themeIcons: Record<ThemePreference, typeof Sun> = {
		light: Sun,
		dark: Moon,
		system: Monitor
	};
</script>

<ThemeController />

{#snippet renderPage()}
	{#if data.page === 'branches'}
		<BranchesPage data={pageData} />
	{:else if data.page === 'login'}
		<LoginPage {form} />
	{:else if data.page === 'setup'}
		<SetupPage {form} />
	{:else if data.page === 'new-branch'}
		<NewBranchPage data={pageData} {form} />
	{:else if data.page === 'settings'}
		<SettingsPage data={pageData} {form} />
	{:else if data.page === 'branch'}
		<BranchPage data={pageData} {form} />
	{/if}
{/snippet}

<div class="min-h-svh bg-gray-50 dark:bg-gray-900">
	{#if data.isAdmin}
		<div class="flex">
			<aside
				class="sticky top-0 flex h-svh w-56 shrink-0 flex-col border-r border-gray-300 bg-white px-3 py-6 dark:border-gray-700 dark:bg-[#1f2937]"
			>
				<nav class="space-y-1">
					<a
						href="/admin"
						class="flex items-center gap-2 px-3 py-2 text-sm transition-colors {currentPublicPath ===
						'/admin'
							? 'font-medium text-heading'
							: 'text-secondary hover:text-heading'}"
					>
						<GitBranch size={16} /> Branches
					</a>
					<a
						href="/admin/settings"
						class="flex items-center gap-2 px-3 py-2 text-sm transition-colors {currentPublicPath ===
						'/admin/settings'
							? 'font-medium text-heading'
							: 'text-secondary hover:text-heading'}"
					>
						<Settings size={16} /> Settings
					</a>
				</nav>
				<div class="mt-auto px-3 pt-6">
					<span class="text-muted mb-2 block px-1 text-xs font-medium">Theme</span>
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
				{@render renderPage()}
			</main>
		</div>
	{:else}
		{@render renderPage()}
	{/if}
</div>
