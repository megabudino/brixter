<script lang="ts">
	import { Folder, Image as ImageIcon, X, ChevronRight, FolderPlus, Upload } from 'lucide-svelte';
	import Spinner from '../ui/Spinner.svelte';

	let {
		open = false,
		branch,
		mediaPath = '',
		endpoint = '/admin/api/media-picker',
		onselect,
		onclose
	}: {
		open?: boolean;
		branch: string;
		mediaPath?: string;
		/** REST endpoint used to list directories/images. Receives `branch` and `path` query params. */
		endpoint?: string;
		onselect?: (detail: { imageUrl: string; fileName: string; path: string }) => void;
		onclose?: () => void;
	} = $props();

	type Entry = { name: string; path: string; type: string; downloadUrl: string };

	let currentPath = $state(mediaPath);
	let entries: Entry[] = $state([]);
	let loading = $state(false);
	let error = $state('');

	let abortController: AbortController | null = null;

	let addingFolder = $state(false);
	let creatingFolder = $state(false);
	let folderName = $state('');
	let folderInput: HTMLInputElement | null = $state(null);

	let fileInput: HTMLInputElement | null = $state(null);
	let uploadingFile = $state(false);

	$effect(() => {
		if (addingFolder && folderInput) {
			folderInput.focus();
		}
	});

	function startAddingFolder() {
		folderName = '';
		addingFolder = true;
	}

	function cancelAddingFolder() {
		addingFolder = false;
		folderName = '';
	}

	async function submitFolder(e: SubmitEvent) {
		e.preventDefault();
		const name = folderName.trim();
		if (!name || creatingFolder) return;

		creatingFolder = true;
		error = '';

		const formData = new FormData();
		formData.append('branch', branch);
		formData.append('path', currentPath);
		formData.append('action', 'create-dir');
		formData.append('name', name);

		try {
			const res = await fetch(endpoint, {
				method: 'POST',
				body: formData
			});
			const data = await res.json();
			if (!res.ok) {
				throw new Error(data.error || 'Failed to create folder');
			}
			addingFolder = false;
			folderName = '';
			await fetchEntries(currentPath);
		} catch (err: any) {
			error = err.message || 'Failed to create folder';
		} finally {
			creatingFolder = false;
		}
	}

	function triggerFileInput() {
		fileInput?.click();
	}

	async function handleFileChange(e: Event) {
		const target = e.target as HTMLInputElement;
		const file = target.files?.[0];
		if (!file) return;

		uploadingFile = true;
		error = '';

		const formData = new FormData();
		formData.append('branch', branch);
		formData.append('path', currentPath);
		formData.append('action', 'upload');
		formData.append('file', file);

		try {
			const res = await fetch(endpoint, {
				method: 'POST',
				body: formData
			});
			const data = await res.json();
			if (!res.ok) {
				throw new Error(data.error || 'Upload failed');
			}
			await fetchEntries(currentPath);
		} catch (err: any) {
			error = err.message || 'Upload failed';
		} finally {
			uploadingFile = false;
			if (fileInput) {
				fileInput.value = '';
			}
		}
	}

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
			// Track currentPath so the effect re-runs when it changes
			const path = currentPath;
			fetchEntries(path);
		} else {
			currentPath = mediaPath;
			entries = [];
			error = '';
			addingFolder = false;
			creatingFolder = false;
			folderName = '';
			uploadingFile = false;
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
		} else {
			onselect?.({ imageUrl: entry.downloadUrl, fileName: entry.name, path: entry.path });
			onclose?.();
		}
	}

	function getRelativePath(absolutePath: string, base: string) {
		const normAbsolute = absolutePath.replace(/^\/+|\/+$/g, '');
		const normBase = base.replace(/^\/+|\/+$/g, '');
		if (normAbsolute === normBase) return '';
		if (normAbsolute.startsWith(normBase + '/')) {
			return normAbsolute.slice(normBase.length + 1);
		}
		return normAbsolute;
	}

	let relativePath = $derived(getRelativePath(currentPath, mediaPath));
	let pathSegments = $derived(relativePath.split('/').filter(Boolean));

	function navigateToParent() {
		const normBase = mediaPath.replace(/^\/+|\/+$/g, '');
		if (pathSegments.length > 1) {
			const subSegments = pathSegments.slice(0, -1);
			currentPath = [normBase, ...subSegments].filter(Boolean).join('/');
		} else {
			currentPath = normBase;
		}
	}

	function navigateToBreadcrumb(index: number) {
		const normBase = mediaPath.replace(/^\/+|\/+$/g, '');
		const subSegments = pathSegments.slice(0, index + 1);
		currentPath = [normBase, ...subSegments].filter(Boolean).join('/');
	}
</script>

{#if open}
	<input
		bind:this={fileInput}
		type="file"
		accept="image/*"
		class="hidden"
		onchange={handleFileChange}
	/>
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
			class="flex max-h-[80vh] w-full max-w-2xl flex-col border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900"
		>
			<!-- Header -->
			<div
				class="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700"
			>
				<h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100">Media</h2>
				<button
					onclick={() => onclose?.()}
					class="p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
				>
					<X size={20} />
				</button>
			</div>

			<!-- Breadcrumb & Actions -->
			<div
				class="flex items-center justify-between border-b border-gray-200 px-4 py-2 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400"
			>
				<div class="flex items-center gap-1">
					<button
						onclick={() => (currentPath = mediaPath)}
						class="cursor-pointer px-1 hover:text-gray-900 dark:hover:text-gray-100"
					>
						Root
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

				<div class="flex items-center gap-3">
					<button
						onclick={triggerFileInput}
						disabled={uploadingFile || creatingFolder}
						class="flex cursor-pointer items-center gap-1.5 hover:text-gray-900 dark:hover:text-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
					>
						{#if uploadingFile}
							<span class="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"></span>
							Uploading...
						{:else}
							<Upload size={14} />
							Upload
						{/if}
					</button>
					<button
						onclick={startAddingFolder}
						disabled={uploadingFile || creatingFolder || addingFolder}
						class="flex cursor-pointer items-center gap-1.5 hover:text-gray-900 dark:hover:text-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
					>
						<FolderPlus size={14} />
						New folder
					</button>
				</div>
			</div>

			<!-- Content -->
			<div class="flex-1 overflow-y-auto">
				{#if loading}
					<div class="flex items-center justify-center py-12">
						<Spinner />
					</div>
				{:else if error}
					<div class="px-4 py-8 text-center text-sm text-red-500 dark:text-red-400">
						{error}
					</div>
				{:else}
					<ul class="divide-y divide-gray-100 dark:divide-gray-800">
						{#if relativePath}
							<li>
								<button
									onclick={navigateToParent}
									class="flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800"
								>
									<Folder size={18} class="text-gray-400 dark:text-gray-500" />
									<span>..</span>
								</button>
							</li>
						{/if}
						{#if addingFolder}
							<li>
								<form
									onsubmit={submitFolder}
									class="flex items-center gap-3 px-4 py-2.5"
								>
									<Folder size={18} class="text-gray-400 dark:text-gray-500 shrink-0" />
									<input
										bind:this={folderInput}
										value={folderName}
										placeholder="new-folder"
										disabled={creatingFolder}
										oninput={(e: Event) => (folderName = (e.target as HTMLInputElement).value)}
										onkeydown={(e: KeyboardEvent) => {
											if (e.key === 'Escape') cancelAddingFolder();
										}}
										onblur={() => {
											if (!folderName.trim() && !creatingFolder) cancelAddingFolder();
										}}
										class="min-w-0 flex-1 bg-transparent text-sm text-gray-900 outline-none dark:text-gray-100"
									/>
									{#if creatingFolder}
										<Spinner />
									{/if}
								</form>
							</li>
						{/if}
						{#each entries as entry}
							<li>
								<button
									onclick={() => handleEntryClick(entry)}
									class="flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800"
								>
									{#if entry.type === 'dir'}
										<Folder size={18} class="text-gray-400 dark:text-gray-500" />
									{:else}
										<ImageIcon size={18} class="text-gray-400 dark:text-gray-500" />
									{/if}
									<span class="flex-1 truncate">{entry.name}</span>
									{#if entry.type !== 'dir' && entry.downloadUrl}
										<img
											src={entry.downloadUrl}
											alt={entry.name}
											class="h-8 w-8 border border-gray-200 object-cover dark:border-gray-700"
										/>
									{/if}
								</button>
							</li>
						{/each}
						{#if entries.length === 0 && !currentPath}
							<li class="px-4 py-8 text-center text-sm text-gray-400 dark:text-gray-500">
								No media files found.
							</li>
						{/if}
					</ul>
				{/if}
			</div>
		</div>
	</div>
{/if}
