<script lang="ts">
	import { enhance } from '$app/forms';
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
		ArrowLeft,
		FileCode
	} from 'lucide-svelte';
	import { Spinner } from 'brixter/ui';

	let { data, form }: { data: any; form: any } = $props();

	// State for inline folder creation
	let addingFolder = $state(false);
	let creatingFolder = $state(false);
	let folderName = $state('');
	let folderInput: HTMLInputElement | null = $state(null);

	// State for file uploading
	let fileInput: HTMLInputElement | null = $state(null);
	let uploadingFiles = $state(false);
	let dragOver = $state(false);

	// State for detailed file view modal
	let selectedFile: any = $state(null);
	let copied = $state(false);
	let showDeleteConfirm = $state(false);
	let deleting = $state(false);

	// Toast state
	let toast: { text: string; type: 'success' | 'error' } | null = $state(null);

	function showToast(text: string, type: 'success' | 'error' = 'success') {
		toast = { text, type };
		setTimeout(() => {
			if (toast?.text === text) {
				toast = null;
			}
		}, 3000);
	}

	// Focus folder input on mount
	$effect(() => {
		if (addingFolder && folderInput) {
			folderInput.focus();
		}
	});

	function getRelativePath(absolutePath: string, base: string) {
		const normAbsolute = absolutePath.replace(/^\/+|\/+$/g, '');
		const normBase = base.replace(/^\/+|\/+$/g, '');
		if (normAbsolute === normBase) return '';
		if (normAbsolute.startsWith(normBase + '/')) {
			return normAbsolute.slice(normBase.length + 1);
		}
		return normAbsolute;
	}

	function formatBytes(bytes: number, decimals = 2) {
		if (!bytes) return '0 Bytes';
		const k = 1024;
		const dm = decimals < 0 ? 0 : decimals;
		const sizes = ['Bytes', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
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
			// Submit the form programmatically using SvelteKit actions
			const response = await fetch('?/uploadMedia', {
				method: 'POST',
				body: formData
			});
			
			// Trigger a page refresh
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
		} catch (err) {
			showToast('Failed to copy path', 'error');
		}
	}

	// Handle action updates
	$effect(() => {
		if (form?.createDirectorySuccess) {
			addingFolder = false;
			folderName = '';
			showToast('Folder created successfully');
		}
		if (form?.deleteSuccess) {
			selectedFile = null;
			showDeleteConfirm = false;
			showToast('Item deleted successfully');
		}
	});

	// Get file preview url for the detailed modal
	function getPreviewUrl(entry: any) {
		if (!entry.downloadUrl) return '';
		// If it's a relative path on local dev
		return `/admin/api/repo-image?branch=${data.branch}&path=${entry.path}`;
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div 
	class="min-h-svh w-full bg-gray-50 p-6 transition-colors dark:bg-[#111827]"
	ondragover={handleDragOver}
	ondragleave={handleDragLeave}
	ondrop={handleDrop}
>
	<!-- File drop indicator overlay -->
	{#if dragOver}
		<div class="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-blue-500/20 backdrop-blur-sm border-4 border-dashed border-blue-500">
			<div class="rounded-xl bg-white p-6 shadow-2xl dark:bg-gray-800 text-center space-y-2">
				<Upload class="mx-auto h-12 w-12 text-blue-500 animate-bounce" />
				<p class="text-lg font-bold text-gray-900 dark:text-gray-100">Drop files here to upload</p>
				<p class="text-sm text-gray-500">Files will be uploaded directly to this folder</p>
			</div>
		</div>
	{/if}

	<!-- Hidden File Input -->
	<input
		bind:this={fileInput}
		type="file"
		multiple
		class="hidden"
		onchange={handleFileChange}
	/>

	<div class="mx-auto max-w-6xl space-y-6">
		<!-- Header / Breadcrumbs -->
		<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-gray-200 pb-5 dark:border-gray-800">
			<div>
				<div class="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 mb-2">
					<a href="/admin/routes" class="hover:text-gray-900 dark:hover:text-gray-100 flex items-center gap-1">
						<ArrowLeft size={14} /> Back
					</a>
					<ChevronRight size={14} />
					{#each data.breadcrumbs as crumb, i}
						{#if i > 0}
							<ChevronRight size={14} />
						{/if}
						{#if i < data.breadcrumbs.length - 1}
							<a
								href="/admin/media/{crumb.path}"
								class="hover:text-gray-900 dark:hover:text-gray-100 font-medium"
							>
								{crumb.label}
							</a>
						{:else}
							<span class="text-gray-900 dark:text-gray-100 font-semibold">{crumb.label}</span>
						{/if}
					{/each}
				</div>
				<h1 class="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-50">Media Library</h1>
				<p class="text-sm text-gray-500 dark:text-gray-400 mt-1">{data.repo.fullName} / {data.branch}</p>
			</div>

			<!-- Actions -->
			<div class="flex items-center gap-3">
				{#if data.relativePath}
					<button
						type="button"
						onclick={() => {
							selectedFile = {
								name: data.relativePath.split('/').pop(),
								path: data.currentPath,
								type: 'dir',
								sha: null
							};
							showDeleteConfirm = true;
						}}
						class="inline-flex items-center gap-2 border border-red-300 dark:border-red-900/50 hover:bg-red-50 dark:hover:bg-red-950/20 text-red-600 dark:text-red-400 font-medium px-4 py-2 text-sm transition-colors rounded-md shadow-sm select-none cursor-pointer"
					>
						<Trash2 size={16} />
						Delete Folder
					</button>
				{/if}

				<button
					type="button"
					onclick={triggerFileInput}
					disabled={uploadingFiles || creatingFolder}
					class="inline-flex items-center gap-2 border border-gray-300 dark:border-gray-700 bg-white hover:bg-gray-50 dark:bg-gray-800 dark:hover:bg-gray-700 font-medium px-4 py-2 text-sm transition-colors rounded-md shadow-sm select-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-gray-700 dark:text-gray-300"
				>
					{#if uploadingFiles}
						<span class="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"></span>
						Uploading...
					{:else}
						<Upload size={16} />
						Upload File
					{/if}
				</button>

				<button
					type="button"
					onclick={startAddingFolder}
					disabled={uploadingFiles || creatingFolder || addingFolder}
					class="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 text-sm transition-colors rounded-md shadow-sm select-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
				>
					<FolderPlus size={16} />
					New Folder
				</button>
			</div>
		</div>

		<!-- Error display -->
		{#if data.loadError}
			<div class="rounded-md bg-red-50 p-4 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50">
				<p class="text-sm text-red-700 dark:text-red-300">{data.loadError}</p>
			</div>
		{/if}

		{#if form?.createDirectoryError}
			<div class="rounded-md bg-red-50 p-4 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50">
				<p class="text-sm text-red-700 dark:text-red-300">{form.createDirectoryError}</p>
			</div>
		{/if}

		{#if form?.deleteError}
			<div class="rounded-md bg-red-50 p-4 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50">
				<p class="text-sm text-red-700 dark:text-red-300">{form.deleteError}</p>
			</div>
		{/if}

		<!-- Grid of items -->
		<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
			<!-- Folder Creation Inline Card -->
			{#if addingFolder}
				<div class="group flex flex-col justify-between overflow-hidden rounded-lg border border-blue-300 bg-blue-50/50 p-4 shadow-sm dark:border-blue-800 dark:bg-blue-950/20">
					<div class="flex items-center gap-3">
						<Folder size={40} class="text-blue-500 shrink-0" />
					</div>
					<form
						method="post"
						action="?/createMediaDirectory"
						use:enhance={() => {
							creatingFolder = true;
							return async ({ result, update }) => {
								creatingFolder = false;
								await update();
							};
						}}
						class="mt-3 flex items-center gap-1.5"
					>
						<input
							bind:this={folderInput}
							name="directory_name"
							value={folderName}
							placeholder="Folder name"
							disabled={creatingFolder}
							oninput={(e: Event) => (folderName = (e.target as HTMLInputElement).value)}
							onkeydown={(e: KeyboardEvent) => {
								if (e.key === 'Escape') cancelAddingFolder();
							}}
							onblur={() => {
								if (!folderName.trim() && !creatingFolder) cancelAddingFolder();
							}}
							class="block w-full border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500 dark:focus:border-blue-500 dark:focus:ring-blue-500 rounded"
						/>
						{#if creatingFolder}
							<Spinner />
						{/if}
					</form>
				</div>
			{/if}

			<!-- Back navigation if in subdirectory -->
			{#if data.relativePath}
				{@const parentLink = data.relativePath.split('/').slice(0, -1).join('/')}
				<a
					href="/admin/media/{parentLink}"
					class="group flex flex-col items-center justify-center aspect-square rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-all hover:shadow-md hover:border-gray-300 dark:border-gray-800 dark:bg-gray-900 dark:hover:bg-gray-800"
				>
					<Folder size={48} class="text-gray-400 dark:text-gray-600 transition-colors group-hover:text-gray-500" />
					<span class="mt-2 text-sm font-semibold text-gray-500 dark:text-gray-400">..</span>
				</a>
			{/if}

			<!-- Files and folders list -->
			{#each data.entries as entry}
				{#if entry.type === 'dir'}
					<a
						href="/admin/media/{getRelativePath(entry.path, data.repo.mediaPath)}"
						class="group flex flex-col items-center justify-center aspect-square rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-all hover:shadow-md hover:border-gray-300 dark:border-gray-800 dark:bg-gray-900 dark:hover:bg-gray-800"
					>
						<div class="relative flex items-center justify-center w-16 h-16">
							<Folder size={54} class="text-blue-500 dark:text-blue-400 transition-transform group-hover:scale-105" />
						</div>
						<span class="mt-2 text-center text-xs font-semibold text-gray-700 dark:text-gray-300 truncate w-full px-1" title={entry.name}>
							{entry.name}
						</span>
					</a>
				{:else}
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						onclick={() => (selectedFile = entry)}
						class="group flex flex-col aspect-square rounded-lg border border-gray-200 bg-white overflow-hidden shadow-sm transition-all hover:shadow-md hover:border-gray-300 dark:border-gray-800 dark:bg-gray-900 cursor-pointer"
					>
						<div class="relative flex-1 bg-gray-50 dark:bg-gray-950 flex items-center justify-center overflow-hidden border-b border-gray-100 dark:border-gray-800">
							{#if isImageFile(entry.name)}
								<img
									src={getPreviewUrl(entry)}
									alt={entry.name}
									class="object-cover w-full h-full transition-transform duration-200 group-hover:scale-105"
									loading="lazy"
								/>
							{:else}
								{@const Icon = getFileIcon(entry.name)}
								<Icon size={40} class="text-gray-400 dark:text-gray-600 transition-colors group-hover:text-gray-500" />
							{/if}
						</div>
						<div class="p-2 bg-white dark:bg-gray-900">
							<p class="text-xs font-semibold text-gray-700 dark:text-gray-300 truncate" title={entry.name}>
								{entry.name}
							</p>
						</div>
					</div>
				{/if}
			{/each}
		</div>

		<!-- Empty state -->
		{#if data.entries.length === 0 && !addingFolder}
			<div class="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-700 p-12 text-center">
				<ImageIcon size={48} class="text-gray-400 dark:text-gray-600 mb-4" />
				<h3 class="text-md font-semibold text-gray-900 dark:text-gray-100">Folder is empty</h3>
				<p class="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-sm">
					Drag and drop files onto the screen or click "Upload File" to add files to this folder.
				</p>
			</div>
		{/if}
	</div>
</div>

<!-- Detailed Modal -->
{#if selectedFile}
	{@const relativePath = getRelativePath(selectedFile.path, data.repo.mediaPath)}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
		role="dialog"
		aria-modal="true"
		onclick={(e) => {
			if (e.target === e.currentTarget && !deleting) {
				selectedFile = null;
				showDeleteConfirm = false;
			}
		}}
	>
		<div class="flex flex-col md:flex-row max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-900">
			<!-- Media Preview Panel (Left) -->
			<div class="flex flex-1 items-center justify-center bg-gray-100 dark:bg-gray-950 p-6 min-h-[300px] md:min-h-0 relative">
				{#if isImageFile(selectedFile.name)}
					<img
						src={getPreviewUrl(selectedFile)}
						alt={selectedFile.name}
						class="max-h-[60vh] max-w-full object-contain"
					/>
				{:else}
					{@const Icon = getFileIcon(selectedFile.name)}
					<div class="text-center space-y-4">
						<Icon size={80} class="text-gray-600 mx-auto" />
						<p class="text-sm text-gray-400">Preview not available for this file type</p>
					</div>
				{/if}
				
				<!-- Close Button for mobile if needed -->
				<button
					onclick={() => { selectedFile = null; showDeleteConfirm = false; }}
					class="absolute top-4 right-4 rounded-full text-gray-500 hover:text-gray-700 hover:bg-gray-200 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-800 p-2 transition-colors cursor-pointer"
				>
					<X size={20} />
				</button>
			</div>

			<!-- Meta Panel (Right) -->
			<div class="flex w-full md:w-80 shrink-0 flex-col justify-between border-t md:border-t-0 md:border-l border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
				<div class="space-y-6">
					<div class="flex items-start justify-between">
						<div class="min-w-0 flex-1">
							<h3 class="text-lg font-bold text-gray-900 dark:text-gray-50 truncate" title={selectedFile.name}>
								{selectedFile.name}
							</h3>
							<span class="inline-block mt-1 text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
								{selectedFile.name.split('.').pop()} file
							</span>
						</div>
					</div>

					<!-- Metadata -->
					<div class="space-y-3 border-t border-gray-100 pt-4 dark:border-gray-800 text-xs">
						<div>
							<span class="text-gray-500 block mb-1">Path</span>
							<div class="flex items-center gap-1.5 mt-1">
								<code class="flex-1 font-mono bg-gray-50 p-2 rounded text-gray-700 dark:bg-gray-950 dark:text-gray-300 select-all overflow-x-auto break-all font-medium">
									/{relativePath}
								</code>
								<button
									onclick={() => copyToClipboard('/' + relativePath)}
									class="p-2 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 rounded text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 shrink-0 cursor-pointer"
									title="Copy Path"
								>
									{#if copied}
										<Check size={16} class="text-green-500" />
									{:else}
										<Copy size={16} />
									{/if}
								</button>
							</div>
						</div>
					</div>
				</div>

				<!-- Delete operations -->
				<div class="border-t border-gray-100 pt-6 mt-6 dark:border-gray-800">
					{#if showDeleteConfirm}
						<div class="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded-lg p-4 space-y-3">
							<p class="text-xs font-semibold text-red-700 dark:text-red-300">
								{#if selectedFile.type === 'dir'}
									Are you sure you want to delete this folder and all its contents? This operation cannot be undone.
								{:else}
									Are you sure you want to delete this file? This operation cannot be undone.
								{/if}
							</p>
							<div class="flex gap-2">
								<form
									method="post"
									action="?/deleteMedia"
									use:enhance={() => {
										deleting = true;
										return async ({ result, update }) => {
											deleting = false;
											if (result.type === 'success') {
												const wasDir = selectedFile.type === 'dir';
												selectedFile = null;
												showDeleteConfirm = false;
												showToast(wasDir ? 'Folder deleted successfully' : 'File deleted successfully');
												if (wasDir) {
													const parentLink = data.relativePath.split('/').slice(0, -1).join('/');
													window.location.href = `/admin/media/${parentLink}`;
												}
											}
											await update();
										};
									}}
									class="flex-1"
								>
									<input type="hidden" name="itemPath" value={selectedFile.path} />
									<input type="hidden" name="sha" value={selectedFile.sha || ''} />
									<input type="hidden" name="isDir" value={selectedFile.type === 'dir' ? 'true' : 'false'} />
									<button
										type="submit"
										disabled={deleting}
										class="w-full inline-flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white font-medium px-4 py-2 text-xs transition-colors rounded-md shadow-sm border border-transparent select-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
									>
										{#if deleting}
											<span class="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent inline-block"></span>
										{:else}
											Yes, delete
										{/if}
									</button>
								</form>
								<button
									onclick={() => (showDeleteConfirm = false)}
									disabled={deleting}
									class="flex-1 inline-flex items-center justify-center gap-2 border border-gray-300 dark:border-gray-700 bg-white hover:bg-gray-50 text-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 font-medium px-4 py-2 text-xs transition-colors rounded-md shadow-sm select-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
								>
									Cancel
								</button>
							</div>
						</div>
					{:else}
						<button
							onclick={() => (showDeleteConfirm = true)}
							class="w-full inline-flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white font-medium px-4 py-2.5 text-sm transition-colors rounded-md shadow-sm border border-transparent select-none cursor-pointer"
						>
							<Trash2 size={16} />
							Delete File
						</button>
					{/if}
				</div>
			</div>
		</div>
	</div>
{/if}

<!-- Toast Notification -->
{#if toast}
	<div class="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2">
		<div
			class="flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium shadow-lg {toast.type ===
			'success'
				? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
				: 'bg-red-600 text-white'}"
		>
			<span>{toast.text}</span>
			<button
				type="button"
				onclick={() => (toast = null)}
				class="ml-2 cursor-pointer opacity-60 transition-opacity hover:opacity-100"
			>
				<X size={14} />
			</button>
		</div>
	</div>
{/if}
