<script lang="ts">
	import { page as pageStore } from '$app/stores';
	import { GitBranch, Settings } from 'lucide-svelte';
	import BranchesPage from './pages/BranchesPage.svelte';
	import LoginPage from './pages/LoginPage.svelte';
	import SetupPage from './pages/SetupPage.svelte';
	import NewBranchPage from './pages/NewBranchPage.svelte';
	import SettingsPage from './pages/SettingsPage.svelte';
	import BranchPage from './pages/BranchPage.svelte';

	let { data, form } = $props();

	const currentPath = $derived($pageStore.url.pathname);
	const currentPublicPath = $derived(currentPath as string);
	const pageData = $derived({ ...(data.pageData ?? {}), isAdmin: data.isAdmin });
</script>

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
				class="sticky top-0 h-svh w-56 shrink-0 border-r border-gray-300 bg-white px-3 py-6 dark:border-gray-700 dark:bg-[#1f2937]"
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
			</aside>
			<main class="min-w-0 flex-1">
				{@render renderPage()}
			</main>
		</div>
	{:else}
		{@render renderPage()}
	{/if}
</div>
