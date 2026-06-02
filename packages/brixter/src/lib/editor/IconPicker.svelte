<script lang="ts">
	import { Folder, X, ChevronRight } from 'lucide-svelte';
	import Spinner from '../ui/Spinner.svelte';

	let {
		open = false,
		branch,
		endpoint = '/admin/api/icon-picker',
		onselect,
		onclose
	}: {
		open?: boolean;
		branch: string;
		endpoint?: string;
		onselect?: (detail: { name: string; path: string; downloadUrl: string }) => void;
		onclose?: () => void;
	} = $props();

	type Entry = { name: string; path: string; type: string; downloadUrl: string | null };

	let currentPath = $state('');
	let entries: Entry[] = $state([]);
	let loading = $state(false);
	let error = $state('');
	let searchFilter = $state('');

	let abortController: AbortController | null = null;

	async function fetchEntries(path: string) {
		abortController?.abort();
		abortController = new AbortController();

		loading = true;
		error = '';
		entries = [];

		const params = new URLSearchParams({ branch, path });

		try {
			const res = await fetch(`${endpoint}?${params}`, {
				signal: abortController.signal
			});
			if (!res.ok) throw new Error(`Failed to fetch: ${res.statusText}`);
			const data = await res.json();
			entries = data.entries;
		} catch (e: any) {
			if (e.name === 'AbortError') return;
			error = e.message || 'An error occurred';
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		if (open) {
			const path = currentPath;
			fetchEntries(path);
		} else {
			currentPath = '';
			entries = [];
			error = '';
			searchFilter = '';
			abortController?.abort();
		}
	});

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			onclose?.();
		}
	}

	function handleEntryClick(entry: Entry) {
		if (entry.type === 'dir') {
			currentPath = entry.path;
			searchFilter = '';
		} else {
			if (entry.downloadUrl) {
				onselect?.({ name: entry.name, path: entry.path, downloadUrl: entry.downloadUrl });
			}
			onclose?.();
		}
	}

	let pathSegments = $derived(currentPath.split('/').filter(Boolean));

	function navigateToParent() {
		if (pathSegments.length > 1) {
			const subSegments = pathSegments.slice(0, -1);
			currentPath = subSegments.join('/');
		} else {
			currentPath = '';
		}
		searchFilter = '';
	}

	function navigateToBreadcrumb(index: number) {
		const subSegments = pathSegments.slice(0, index + 1);
		currentPath = subSegments.join('/');
		searchFilter = '';
	}

	const filteredEntries = $derived(
		entries.filter((entry) =>
			entry.name.toLowerCase().includes(searchFilter.toLowerCase().trim())
		)
	);
</script>

{#if open}
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div
		class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50"
		role="dialog"
		aria-modal="true"
		tabindex="-1"
		onclick={(e) => {
			if (e.target === e.currentTarget) onclose?.();
		}}
		onkeydown={handleKeydown}
	>
		<div
			class="flex h-[80vh] w-full max-w-3xl flex-col border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900"
		>
			<!-- Header -->
			<div
				class="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700"
			>
				<h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100">Choose Icon</h2>
				<button
					onclick={() => onclose?.()}
					class="p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
				>
					<X size={20} />
				</button>
			</div>

			<!-- Breadcrumb & Search -->
			<div
				class="flex flex-col gap-2 border-b border-gray-200 px-4 py-2 text-sm text-gray-500 sm:flex-row sm:items-center sm:justify-between dark:border-gray-700 dark:text-gray-400"
			>
				<div class="flex items-center gap-1">
					<button
						onclick={() => { currentPath = ''; searchFilter = ''; }}
						class="cursor-pointer px-1 hover:text-gray-900 dark:hover:text-gray-100"
					>
						Icons
					</button>
					{#each pathSegments as segment, i}
						<ChevronRight size={14} />
						<button
							onclick={() => navigateToBreadcrumb(i)}
							class="cursor-pointer px-1 hover:text-gray-900 dark:hover:text-gray-100"
						>
							{segment}
						</button>
					{/each}
				</div>

				{#if pathSegments.length > 0}
					<div class="w-full sm:w-48">
						<input
							type="text"
							placeholder="Search icons..."
							bind:value={searchFilter}
							class="w-full border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 placeholder-gray-400 focus:border-[#2563EB] focus:outline-none dark:border-gray-700 dark:bg-[#1f2937] dark:text-gray-100"
						/>
					</div>
				{/if}
			</div>

			<!-- Content -->
			<div class="flex-1 overflow-y-auto p-4">
				{#if loading}
					<div class="flex items-center justify-center py-12">
						<Spinner />
					</div>
				{:else if error}
					<div class="py-8 text-center text-sm text-red-500 dark:text-red-400">
						{error}
					</div>
				{:else if filteredEntries.length === 0}
					<div class="py-8 text-center text-sm text-gray-400 dark:text-gray-500">
						No items found.
					</div>
				{:else if pathSegments.length === 0}
					<!-- We are at root, list icon packs as directory folders -->
					<div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
						{#each filteredEntries as entry}
							{#if entry.type === 'dir'}
								<button
									onclick={() => handleEntryClick(entry)}
									class="flex items-center gap-3 border border-gray-200 bg-white p-4 text-left text-sm text-gray-700 hover:border-[#2563EB] hover:bg-gray-55 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-[#3B82F6] dark:hover:bg-gray-800/80"
								>
									<Folder class="h-6 w-6 text-yellow-500 shrink-0" />
									<span class="font-medium truncate">{entry.name}</span>
								</button>
							{/if}
						{/each}
					</div>
				{:else}
					<!-- We are inside an icon pack, list the icons in a grid -->
					<div class="grid grid-cols-4 gap-3 sm:grid-cols-6 md:grid-cols-8">
						{#if currentPath}
							<button
								onclick={navigateToParent}
								class="flex flex-col items-center justify-center border border-gray-200 bg-white p-3 text-center hover:border-[#2563EB] hover:bg-gray-55 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-[#3B82F6] dark:hover:bg-gray-800/80"
							>
								<Folder class="h-6 w-6 text-gray-400 dark:text-gray-500" />
								<span class="mt-1.5 block w-full truncate text-[10px] text-gray-500 dark:text-gray-400">
									..
								</span>
							</button>
						{/if}
						{#each filteredEntries as entry}
							{#if entry.type !== 'dir'}
								<button
									onclick={() => handleEntryClick(entry)}
									class="flex flex-col items-center justify-center border border-gray-200 bg-white p-3 text-center hover:border-[#2563EB] hover:bg-gray-55 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-[#3B82F6] dark:hover:bg-gray-800/80"
									title={entry.name.replace('.svg', '')}
								>
									{#if entry.downloadUrl}
										<div class="flex h-8 w-8 items-center justify-center text-gray-700 dark:text-gray-300">
											<img
												src={entry.downloadUrl}
												alt={entry.name}
												class="h-6 w-6 object-contain dark:invert"
											/>
										</div>
									{/if}
									<span class="mt-1.5 block w-full truncate text-[10px] text-gray-500 dark:text-gray-400">
										{entry.name.replace('.svg', '')}
									</span>
								</button>
							{/if}
						{/each}
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}
