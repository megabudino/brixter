<script lang="ts">
	import { enhance } from '$app/forms';
	import { navigating } from '$app/stores';
	import {
		Folder,
		Image as ImageIcon,
		FileText,
		X,
		ChevronRight,
		FolderPlus,
		Upload,
		Copy,
		Check,
		Trash2,
		FileCode
	} from 'lucide-svelte';
	import { Spinner } from '../../ui';
	import { fly } from 'svelte/transition';

	let { data, form }: { data: any; form: any } = $props();

	let addingFolder = $state(false);
	let creatingFolder = $state(false);
	let folderName = $state('');
	let fileInput: HTMLInputElement | null = $state(null);
	let uploadingFiles = $state(false);
	let dragOver = $state(false);
	let selectedFile: any = $state(null);
	let copied = $state(false);
	let deleteTarget: { name: string; path: string; type: string; sha: string | null } | null =
		$state(null);
	let deleting = $state(false);
	let toast: { text: string; type: 'success' | 'error' } | null = $state(null);
	let toastTimeout: ReturnType<typeof setTimeout> | undefined;

	const breadcrumbs = $derived(data.breadcrumbs ?? []);
	const isMediaRoot = $derived(!data.relativePath && breadcrumbs.length <= 1);

	function showToast(text: string, type: 'success' | 'error' = 'success') {
		clearTimeout(toastTimeout);
		toast = { text, type };
		toastTimeout = setTimeout(() => {
			toast = null;
		}, 3000);
	}

	function focusOnMount(node: HTMLInputElement) {
		node.focus();
	}

	function mediaHref(path = '') {
		const base = '/admin/media';
		if (!path) return base;
		return `${base}/${path
			.split('/')
			.map((segment) => encodeURIComponent(segment))
			.join('/')}`;
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

	function getFileIcon(name: string) {
		const ext = '.' + name.split('.').pop()?.toLowerCase();
		const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'];
		if (imageExtensions.includes(ext)) return ImageIcon;
		const codeExtensions = ['.json', '.html', '.css', '.js', '.ts', '.svelte', '.yaml', '.yml'];
		if (codeExtensions.includes(ext)) return FileCode;
		return FileText;
	}

	function isImageFile(name: string) {
		const ext = '.' + name.split('.').pop()?.toLowerCase();
		const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'];
		return imageExtensions.includes(ext);
	}

	function startAddingFolder() {
		folderName = '';
		addingFolder = true;
	}

	function cancelAddingFolder() {
		addingFolder = false;
		folderName = '';
	}

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		dragOver = true;
	}

	function handleDragLeave(e: DragEvent) {
		e.preventDefault();
		dragOver = false;
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		dragOver = false;
		const files = e.dataTransfer?.files;
		if (files && files.length > 0) {
			uploadMultipleFiles(files);
		}
	}

	function triggerFileInput() {
		fileInput?.click();
	}

	function handleFileChange(e: Event) {
		const target = e.target as HTMLInputElement;
		const files = target.files;
		if (files && files.length > 0) {
			uploadMultipleFiles(files);
		}
	}

	async function uploadMultipleFiles(files: FileList) {
		uploadingFiles = true;
		const formData = new FormData();
		for (let i = 0; i < files.length; i++) {
			formData.append('files', files[i]);
		}

		try {
			await fetch('?/uploadMedia', {
				method: 'POST',
				body: formData
			});
			window.location.reload();
		} catch (err: any) {
			showToast(err.message || 'Upload failed', 'error');
			uploadingFiles = false;
		}
	}

	async function copyToClipboard(text: string) {
		try {
			await navigator.clipboard.writeText(text);
			copied = true;
			showToast('Path copied to clipboard');
			setTimeout(() => (copied = false), 2000);
		} catch {
			showToast('Failed to copy path', 'error');
		}
	}

	function getPreviewUrl(entry: any) {
		return `/admin/api/repo-image?branch=${data.branch}&path=${entry.path}`;
	}

	function beginDelete(item: { name: string; path: string; type: string; sha?: string | null }) {
		deleteTarget = {
			name: item.name,
			path: item.path,
			type: item.type,
			sha: item.sha ?? null
		};
	}

	function cancelDelete() {
		deleteTarget = null;
	}

	function handleDeleteKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && !deleting) {
			cancelDelete();
		}
	}

	$effect(() => {
		if (form?.createDirectorySuccess) {
			addingFolder = false;
			folderName = '';
			showToast('Folder created successfully');
		}
		if (form?.deleteSuccess) {
			selectedFile = null;
			deleteTarget = null;
			showToast('Item deleted successfully');
		}
	});
</script>

{#if $navigating}
	<div class="fixed top-0 right-0 left-0 z-60 h-1 overflow-hidden bg-gray-200 dark:bg-gray-800">
		<div class="animate-slide h-full w-1/3 bg-[#FDE047] dark:bg-[#FACC15]"></div>
	</div>
	<div class="fixed inset-0 z-55 flex items-center justify-center bg-white/50 dark:bg-gray-950/50">
		<Spinner />
	</div>
{/if}

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="relative"
	ondragover={handleDragOver}
	ondragleave={handleDragLeave}
	ondrop={handleDrop}
>
	{#if dragOver}
		<div
			class="pointer-events-none fixed inset-0 z-50 flex items-center justify-center border-4 border-dashed border-[#FDE047] bg-[#FDE047]/10 backdrop-blur-sm dark:border-[#FACC15] dark:bg-[#FACC15]/10"
		>
			<div class="space-y-2 border border-gray-300 bg-white px-6 py-5 text-center shadow-lg dark:border-gray-700 dark:bg-gray-800">
				<Upload class="bx-text-heading mx-auto h-10 w-10" />
				<p class="bx-text-heading text-sm font-medium">Drop files here to upload</p>
				<p class="bx-text-muted text-sm">Files will be added to this folder</p>
			</div>
		</div>
	{/if}

	<input bind:this={fileInput} type="file" multiple class="hidden" onchange={handleFileChange} />

	<div class="mx-auto max-w-2xl px-6 py-16">
		{#if !isMediaRoot}
			<a href={mediaHref()} class="bx-text-secondary hover:bx-text-heading text-sm transition-colors">
				← Back to media
			</a>
		{/if}

		<h1 class="bx-font-display mt-4 mb-2 text-3xl text-gray-900 dark:text-gray-50">Media</h1>
		<p class="bx-text-secondary mb-8">{data.repo.fullName}</p>

		{#if breadcrumbs.length > 1}
			<div class="bx-text-muted mb-8 flex items-center gap-1 text-sm">
				{#each breadcrumbs as crumb, i}
					{#if i > 0}
						<ChevronRight size={14} />
					{/if}
					{#if i < breadcrumbs.length - 1}
						<a
							href={mediaHref(crumb.path)}
							class="bx-text-secondary hover:bx-text-heading transition-colors">{crumb.label}</a
						>
					{:else}
						<span class="bx-text-heading">{crumb.label}</span>
					{/if}
				{/each}
			</div>
		{/if}

		<div class="mb-4 flex flex-wrap items-center justify-end gap-4">
			{#if data.relativePath}
				<button
					type="button"
					onclick={() =>
						beginDelete({
							name: data.relativePath.split('/').pop() ?? '',
							path: data.currentPath,
							type: 'dir',
							sha: null
						})}
					class="bx-text-error hover:text-red-700 dark:hover:text-red-300 inline-flex cursor-pointer items-center gap-2 text-sm transition-colors"
				>
					<Trash2 size={16} />
					Delete folder
				</button>
			{/if}
			<button
				type="button"
				onclick={triggerFileInput}
				disabled={uploadingFiles || creatingFolder}
				class="bx-text-secondary hover:bx-text-heading inline-flex cursor-pointer items-center gap-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50"
			>
				{#if uploadingFiles}
					<Spinner />
					Uploading…
				{:else}
					<Upload size={16} />
					Upload file
				{/if}
			</button>
			<button
				type="button"
				onclick={startAddingFolder}
				disabled={uploadingFiles || creatingFolder || addingFolder}
				class="bx-text-secondary hover:bx-text-heading inline-flex cursor-pointer items-center gap-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50"
			>
				<FolderPlus size={16} />
				New folder
			</button>
		</div>

		{#if data.loadError}
			<p class="bx-text-error mb-3 text-sm">{data.loadError}</p>
		{/if}
		{#if form?.createDirectoryError}
			<p class="bx-text-error mb-3 text-sm">{form.createDirectoryError}</p>
		{/if}
		{#if form?.deleteError}
			<p class="bx-text-error mb-3 text-sm">{form.deleteError}</p>
		{/if}

		{#if data.relativePath}
			{@const parentLink = data.relativePath.split('/').slice(0, -1).join('/')}
			<a
				href={mediaHref(parentLink)}
				class="bx-text-secondary hover:bx-text-heading flex cursor-pointer items-center gap-3 border border-b-0 border-gray-300 bg-white px-5 py-4 transition-colors hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700"
			>
				..
			</a>
		{/if}

		<div class="border border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-800">
			{#if data.entries.length > 0 || addingFolder}
				<ul class="divide-y divide-gray-300 dark:divide-gray-700">
					{#each data.entries as entry}
						<li>
							{#if entry.type === 'dir'}
								<a
									href={mediaHref(getRelativePath(entry.path, data.repo.mediaPath))}
									class="flex cursor-pointer items-center gap-3 px-5 py-4 text-gray-900 transition-colors hover:bg-gray-100 dark:text-gray-100 dark:hover:bg-gray-700"
								>
									<Folder size={18} class="bx-text-muted shrink-0" />
									<span class="min-w-0 flex-1">{entry.name}</span>
								</a>
							{:else}
								<button
									type="button"
									onclick={() => (selectedFile = entry)}
									class="flex w-full cursor-pointer items-center gap-3 px-5 py-4 text-left text-gray-900 transition-colors hover:bg-gray-100 dark:text-gray-100 dark:hover:bg-gray-700"
								>
									{#if isImageFile(entry.name)}
										<img
											src={getPreviewUrl(entry)}
											alt=""
											class="h-10 w-10 shrink-0 border border-gray-300 object-cover dark:border-gray-600"
											loading="lazy"
										/>
									{:else}
										{@const Icon = getFileIcon(entry.name)}
										<Icon size={18} class="bx-text-muted shrink-0" />
									{/if}
									<span class="min-w-0 flex-1">{entry.name}</span>
								</button>
							{/if}
						</li>
					{/each}
					{#if addingFolder}
						<li>
							<form
								method="post"
								action="?/createMediaDirectory"
								class="flex items-center gap-3 px-5 py-4"
								use:enhance={() => {
									creatingFolder = true;
									return async ({ update }) => {
										creatingFolder = false;
										await update();
									};
								}}
							>
								<Folder size={18} class="bx-text-muted shrink-0" />
								<input
									use:focusOnMount
									name="directory_name"
									value={folderName}
									placeholder="folder-name"
									aria-label="New folder name"
									disabled={creatingFolder}
									oninput={(e: Event) => (folderName = (e.target as HTMLInputElement).value)}
									onkeydown={(e: KeyboardEvent) => {
										if (e.key === 'Escape') cancelAddingFolder();
									}}
									onblur={() => {
										if (!folderName.trim() && !creatingFolder) cancelAddingFolder();
									}}
									class="min-w-0 flex-1 bg-transparent text-gray-900 outline-none dark:text-gray-100"
								/>
								{#if creatingFolder}
									<Spinner />
								{/if}
							</form>
						</li>
					{/if}
				</ul>
			{:else}
				<p class="bx-text-muted py-8 text-center text-sm">
					There's nothing here. Drag files here or use Upload file.
				</p>
			{/if}
		</div>
	</div>
</div>

{#if selectedFile}
	{@const relativePath = getRelativePath(selectedFile.path, data.repo.mediaPath)}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
		role="dialog"
		aria-modal="true"
		onclick={(e) => {
			if (e.target === e.currentTarget && !deleting && !deleteTarget) {
				selectedFile = null;
			}
		}}
	>
		<div
			class="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden border border-gray-300 bg-white md:flex-row dark:border-gray-700 dark:bg-gray-800"
		>
			<div
				class="relative flex min-h-[240px] flex-1 items-center justify-center border-b border-gray-300 bg-gray-100 p-6 md:min-h-0 md:border-r md:border-b-0 dark:border-gray-700 dark:bg-gray-900"
			>
				{#if isImageFile(selectedFile.name)}
					<img
						src={getPreviewUrl(selectedFile)}
						alt={selectedFile.name}
						class="max-h-[50vh] max-w-full object-contain"
					/>
				{:else}
					{@const Icon = getFileIcon(selectedFile.name)}
					<div class="space-y-3 text-center">
						<Icon size={64} class="bx-text-muted mx-auto" />
						<p class="bx-text-muted text-sm">Preview not available for this file type</p>
					</div>
				{/if}
				<button
					type="button"
					onclick={() => (selectedFile = null)}
					class="bx-text-secondary hover:bx-text-heading absolute top-3 right-3 cursor-pointer p-2 transition-colors"
					aria-label="Close"
				>
					<X size={20} />
				</button>
			</div>

			<div class="flex w-full shrink-0 flex-col justify-between p-6 md:w-72">
				<div class="space-y-5">
					<div>
						<h3 class="bx-text-heading truncate text-lg font-semibold" title={selectedFile.name}>
							{selectedFile.name}
						</h3>
						<span
							class="bx-text-muted mt-1 inline-block rounded bg-gray-100 px-1.5 py-0.5 text-[10px] tracking-wide uppercase dark:bg-gray-800"
						>
							{selectedFile.name.split('.').pop()} file
						</span>
					</div>

					<div>
						<span class="bx-text-muted mb-1 block text-xs">Path</span>
						<div class="flex items-start gap-2">
							<code
								class="bx-text-heading min-w-0 flex-1 break-all rounded bg-gray-100 px-2 py-1.5 font-mono text-xs dark:bg-gray-900"
							>
								/{relativePath}
							</code>
							<button
								type="button"
								onclick={() => copyToClipboard('/' + relativePath)}
								class="bx-text-secondary hover:bx-text-heading shrink-0 cursor-pointer border border-gray-300 p-2 transition-colors dark:border-gray-600"
								title="Copy path"
							>
								{#if copied}
									<Check size={16} class="text-green-600 dark:text-green-400" />
								{:else}
									<Copy size={16} />
								{/if}
							</button>
						</div>
					</div>
				</div>

				<div class="mt-8 border-t border-gray-300 pt-6 dark:border-gray-700">
					<button
						type="button"
						onclick={() => beginDelete(selectedFile)}
						class="bx-text-error hover:text-red-700 dark:hover:text-red-300 inline-flex w-full cursor-pointer items-center justify-center gap-2 text-sm transition-colors"
					>
						<Trash2 size={16} />
						{selectedFile.type === 'dir' ? 'Delete folder' : 'Delete file'}
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}

{#if deleteTarget}
	<div class="fixed inset-0 z-70 flex items-center justify-center p-6">
		<button
			type="button"
			class="absolute inset-0 bg-black/50"
			aria-label="Cancel delete"
			disabled={deleting}
			onclick={() => !deleting && cancelDelete()}
		></button>
		<div
			class="relative w-full max-w-md border border-gray-300 bg-white p-6 shadow-2xl dark:border-gray-700 dark:bg-gray-800"
			role="alertdialog"
			aria-modal="true"
			aria-labelledby="delete-media-title"
			tabindex="-1"
			onkeydown={handleDeleteKeydown}
		>
			<h2 id="delete-media-title" class="bx-text-heading text-lg font-semibold">
				{deleteTarget.type === 'dir' ? 'Delete folder' : 'Delete file'}
			</h2>
			<p class="bx-text-secondary mt-2 text-sm">
				{#if deleteTarget.type === 'dir'}
					Delete “{deleteTarget.name}” and everything inside it? This cannot be undone.
				{:else}
					Delete “{deleteTarget.name}”? This cannot be undone.
				{/if}
			</p>
			<div class="mt-6 flex gap-2">
				<form
					method="post"
					action="?/deleteMedia"
					class="flex-1"
					use:enhance={() => {
						deleting = true;
						return async ({ result, update }) => {
							deleting = false;
							if (result.type === 'success') {
								const wasDir = deleteTarget?.type === 'dir';
								deleteTarget = null;
								selectedFile = null;
								showToast(
									wasDir ? 'Folder deleted successfully' : 'File deleted successfully'
								);
								if (wasDir) {
									const parentLink = data.relativePath.split('/').slice(0, -1).join('/');
									window.location.href = mediaHref(parentLink);
								}
							}
							await update();
						};
					}}
				>
					<input type="hidden" name="itemPath" value={deleteTarget.path} />
					<input type="hidden" name="sha" value={deleteTarget.sha || ''} />
					<input
						type="hidden"
						name="isDir"
						value={deleteTarget.type === 'dir' ? 'true' : 'false'}
					/>
					<button
						type="submit"
						disabled={deleting}
						class="inline-flex w-full cursor-pointer items-center justify-center gap-2 bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
					>
						{#if deleting}
							<Spinner />
						{:else}
							Yes, delete
						{/if}
					</button>
				</form>
				<button
					type="button"
					onclick={cancelDelete}
					disabled={deleting}
					class="bx-text-secondary hover:bx-text-heading inline-flex flex-1 cursor-pointer items-center justify-center border border-gray-300 px-4 py-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600"
				>
					Cancel
				</button>
			</div>
		</div>
	</div>
{/if}

{#if toast}
	<div class="fixed bottom-6 left-1/2 z-60 -translate-x-1/2" transition:fly={{ y: 16, duration: 200 }}>
		<div
			class="flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium shadow-lg {toast.type ===
			'success'
				? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
				: 'bg-red-600 text-white'}"
		>
			{toast.text}
			<button
				type="button"
				onclick={() => (toast = null)}
				class="ml-1 cursor-pointer opacity-60 transition-opacity hover:opacity-100"
			>
				<X size={14} />
			</button>
		</div>
	</div>
{/if}

<style>
	@keyframes slide {
		0% {
			transform: translateX(-100%);
		}
		100% {
			transform: translateX(400%);
		}
	}
	:global(.animate-slide) {
		animation: slide 1.2s ease-in-out infinite;
	}
</style>
