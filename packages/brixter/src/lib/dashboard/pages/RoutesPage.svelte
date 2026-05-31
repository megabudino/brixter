<script lang="ts">
	import { enhance } from '$app/forms';
	import { navigating } from '$app/stores';
	import {
		Folder,
		FolderPlus,
		FileText,
		FilePlus,
		Image,
		ChevronRight,
		AlertTriangle,
		X,
		ArrowLeft
	} from 'lucide-svelte';
	import { Spinner } from 'brixter/ui';
	import { BrixEditor, createBrixDefinitions } from '@brixter/brix-builder';
	import {
		RichTextEditor,
		Toolbar,
		InlineToolbar,
		FrontmatterEditor,
		MediaPicker
	} from 'brixter/editor';
	import TurndownService from 'turndown';
	import { onMount } from 'svelte';
	import { fly } from 'svelte/transition';

	let { data, form }: { data: any; form: any } = $props();

	const brixDefinitions = createBrixDefinitions(
		import.meta.glob('$lib/brixter/brix/*.svelte', { eager: true }),
		import.meta.glob('$lib/brixter/brix/*.svelte', {
			query: '?raw',
			import: 'default',
			eager: true
		}) as Record<string, string>
	);

	let merging = $state(false);
	let saving = $state(false);
	let addingDirectory = $state(false);
	let creatingDirectory = $state(false);
	let directoryName = $state('');
	let addingPage = $state(false);
	let creatingPage = $state(false);
	let pageName = $state('');
	let lightbox = $state<{ name: string; url: string } | null>(null);

	const existingDirNames = $derived(
		new Set<string>((data.childDirNames ?? []).map((name: string) => name.toLowerCase()))
	);
	const existingPageNames = $derived(
		new Set<string>((data.childPageNames ?? []).map((name: string) => name.toLowerCase()))
	);
	const trimmedDirectoryName = $derived(directoryName.trim());
	const duplicateDirectory = $derived(
		trimmedDirectoryName.length > 0 &&
			existingDirNames.has(trimmedDirectoryName.toLowerCase()) &&
			!existingPageNames.has(trimmedDirectoryName.toLowerCase())
	);
	const trimmedPageName = $derived(pageName.trim());
	const duplicatePage = $derived(
		trimmedPageName.length > 0 && existingPageNames.has(trimmedPageName.toLowerCase())
	);

	function startAddingDirectory() {
		cancelAddingPage();
		directoryName = '';
		addingDirectory = true;
	}

	function cancelAddingDirectory() {
		addingDirectory = false;
		directoryName = '';
	}

	function startAddingPage() {
		cancelAddingDirectory();
		pageName = '';
		addingPage = true;
	}

	function cancelAddingPage() {
		addingPage = false;
		pageName = '';
	}

	function focusOnMount(node: HTMLInputElement) {
		node.focus();
	}
	let editorRef: RichTextEditor | null = $state(null);
	let frontmatterRef: FrontmatterEditor | null = $state(null);
	let editorInstance: any = $state(null);
	let mediaPickerOpen = $state(false);
	let editorFocused = $state(false);
	let htmlBlockFocused = $state(false);
	let activeTab: 'body' | 'frontmatter' = $state('body');
	let frontmatterValue = $state('');
	const hasFrontmatter = $derived(data.file?.frontmatter !== undefined);
	let toastMessage = $state<{ text: string; type: 'success' | 'error' } | null>(null);
	let toastTimeout: ReturnType<typeof setTimeout> | undefined;

	function showToast(text: string, type: 'success' | 'error' = 'success') {
		clearTimeout(toastTimeout);
		toastMessage = { text, type };
		toastTimeout = setTimeout(() => {
			toastMessage = null;
		}, 3000);
	}

	let initialMarkdown = $state('');
	let currentMarkdown = $state('');
	let initialFm = $state('');
	let initialBrixYaml = $state('');
	let currentBrixYaml = $state('');
	let brixYamlHydrated = $state(false);
	let loadedFilePath = $state<string | null>(null);
	const bodyDirty = $derived(initialMarkdown !== '' && currentMarkdown !== initialMarkdown);
	const frontmatterDirty = $derived(frontmatterValue !== initialFm);
	const brixDirty = $derived(currentBrixYaml !== initialBrixYaml);
	const isDirty = $derived(bodyDirty || frontmatterDirty || brixDirty);

	const base = '/admin/routes';
	const isEditing = $derived(!!data.file?.htmlContent);
	const isBrixEditing = $derived(data.file?.brixYaml !== undefined);
	const backHref = $derived(data.parentPath ? routesHref(data.parentPath) : base);
	const isUnsupportedFile = $derived(!!data.file && !isEditing && !isBrixEditing);

	const breadcrumbs = $derived(data.breadcrumbs ?? []);
	const isRoutesRoot = $derived(!data.parentPath && breadcrumbs.length === 0);

	$effect(() => {
		const file = data.file;
		const filePath = file?.path ?? null;
		if (filePath === loadedFilePath) return;

		loadedFilePath = filePath;
		const nextFrontmatter = file?.frontmatter ?? '';
		frontmatterValue = nextFrontmatter;
		initialFm = nextFrontmatter;
		const nextBrixYaml = file?.brixYaml ?? '';
		initialBrixYaml = nextBrixYaml;
		currentBrixYaml = nextBrixYaml;
		brixYamlHydrated = false;
		initialMarkdown = '';
		currentMarkdown = '';
	});

	const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp']);

	function isImage(name: string) {
		const dot = name.lastIndexOf('.');
		return dot !== -1 && imageExtensions.has(name.slice(dot).toLowerCase());
	}

	function routesHref(path = '') {
		const base = '/admin/routes';
		if (!path) return base;
		return `${base}/${path
			.split('/')
			.map((segment) => (segment === '+page' ? segment : encodeURIComponent(segment)))
			.join('/')}`;
	}

	const parentPath = $derived.by(() => {
		return data.parentPath ?? null;
	});

	const turndown = new TurndownService({
		headingStyle: 'atx',
		hr: '---',
		bulletListMarker: '-',
		codeBlockStyle: 'fenced'
	});

	turndown.addRule('listItem', {
		filter: 'li',
		replacement: (content, node) => {
			const parent = node.parentNode as HTMLElement;
			const isOrdered = parent?.nodeName === 'OL';
			const prefix = isOrdered
				? `${Array.from(parent.children).indexOf(node as Element) + 1}. `
				: '- ';
			return prefix + content.trim() + '\n';
		}
	});

	turndown.addRule('htmlBlock', {
		filter: (node) => node.nodeName === 'DIV' && node.hasAttribute('data-html-block'),
		replacement: (_content, node) => {
			const html = (node as HTMLElement).getAttribute('data-content') ?? '';
			return html ? `\n${html}\n` : '';
		}
	});

	turndown.addRule('strikethrough', {
		filter: ['del', 's'] as any,
		replacement: (content) => `~~${content}~~`
	});

	const mediaPrefix = $derived(
		data.repo.mediaPath ? data.repo.mediaPath.replace(/\/$/, '') + '/' : ''
	);

	turndown.addRule('repoImage', {
		filter: (node) => {
			if (node.nodeName !== 'IMG') return false;
			const src = node.getAttribute('src') ?? '';
			return (
				src.startsWith('/admin/api/repo-image?') ||
				/^https:\/\/raw\.githubusercontent\.com\//.test(src)
			);
		},
		replacement: (_content, node) => {
			const src = (node as HTMLElement).getAttribute('src') ?? '';
			let repoPath: string;
			if (src.startsWith('/admin/api/repo-image?')) {
				const params = new URLSearchParams(src.split('?')[1]);
				repoPath = params.get('path') ?? '';
			} else {
				const match = src.match(
					/^https:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/[^/]+\/(.+)$/
				);
				repoPath = match ? match[1].split('?')[0] : src;
			}
			if (mediaPrefix && repoPath.startsWith(mediaPrefix)) {
				repoPath = repoPath.slice(mediaPrefix.length);
			}
			const alt = (node as HTMLElement).getAttribute('alt') ?? '';
			return `![${alt}](/${repoPath})`;
		}
	});

	function getMarkdown(): string {
		if (!editorRef) return '';
		const { html } = editorRef.getContent();
		return turndown.turndown(html);
	}

	function handleBack() {
		window.location.href = backHref;
	}

	onMount(() => {
		const handler = (e: BeforeUnloadEvent) => {
			if (isDirty) {
				e.preventDefault();
			}
		};
		window.addEventListener('beforeunload', handler);
		return () => window.removeEventListener('beforeunload', handler);
	});
</script>

{#if $navigating}
	<div class="fixed top-0 right-0 left-0 z-60 h-1 overflow-hidden bg-gray-200 dark:bg-gray-800">
		<div class="animate-slide h-full w-1/3 bg-[#2563EB] dark:bg-[#3B82F6]"></div>
	</div>
	<div class="fixed inset-0 z-55 flex items-center justify-center bg-white/50 dark:bg-gray-950/50">
		<Spinner />
	</div>
{/if}

{#if isEditing}
	<!-- Full-screen markdown editor -->
	<div class="fixed inset-0 z-50 flex flex-col bg-white dark:bg-[#111827]">
		<!-- Editor header -->
		<div
			class="relative z-30 flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700"
		>
			<div class="flex items-center gap-3">
				<button
					type="button"
					onclick={handleBack}
					class="text-muted hover:text-heading cursor-pointer transition-colors"
				>
					<ArrowLeft size={20} />
				</button>
				<span class="text-sm font-medium text-gray-900 dark:text-gray-100">{data.file.name}</span>
			</div>
			{#if hasFrontmatter}
				<div
					class="absolute left-1/2 flex -translate-x-1/2 items-center rounded-full bg-gray-100 p-0.5 dark:bg-gray-800"
				>
					<button
						type="button"
						onclick={() => (activeTab = 'body')}
						class="cursor-pointer rounded-full px-3 py-1 text-xs font-medium transition-colors {activeTab ===
						'body'
							? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100'
							: 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}"
					>
						Body
					</button>
					<button
						type="button"
						onclick={() => (activeTab = 'frontmatter')}
						class="cursor-pointer rounded-full px-3 py-1 text-xs font-medium transition-colors {activeTab ===
						'frontmatter'
							? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100'
							: 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}"
					>
						Frontmatter
					</button>
				</div>
			{/if}
			<form
				method="post"
				action="?/save"
				use:enhance={({ formData }) => {
					formData.set('markdown', getMarkdown());
					formData.set('frontmatter', frontmatterRef?.getValue() ?? frontmatterValue);
					formData.set('sha', data.file.sha);
					saving = true;
					return async ({ result, update }) => {
						saving = false;
						if (result.type === 'success') {
							initialMarkdown = currentMarkdown;
							initialFm = frontmatterValue;
							showToast('Saved successfully.');
						} else if (result.type === 'failure') {
							showToast((result.data as any)?.saveError ?? 'Save failed.', 'error');
						}
						await update({ reset: false });
					};
				}}
			>
				<button
					type="submit"
					disabled={saving || !isDirty}
					class="inline-flex cursor-pointer items-center gap-2 bg-[#2563EB] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#3B82F6] disabled:cursor-not-allowed disabled:opacity-50"
				>
					{#if saving}
						<Spinner /> Committing…
					{:else}
						Commit
					{/if}
				</button>
			</form>
		</div>

		<!-- Body tab -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="relative flex-1 overflow-y-auto"
			class:hidden={activeTab !== 'body'}
			onfocusin={(e) => {
				editorFocused = true;
				htmlBlockFocused = !!(e.target as HTMLElement).closest?.('.html-block');
			}}
			onfocusout={(e) => {
				if (!e.currentTarget.contains(e.relatedTarget as Node)) {
					editorFocused = false;
					htmlBlockFocused = false;
				}
			}}
		>
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="sticky top-0 z-20 flex justify-center border-b bg-white px-4 py-2 transition-all duration-200 dark:bg-[#111827] {editorFocused
					? 'translate-y-0 border-gray-200 opacity-100 dark:border-gray-700'
					: 'pointer-events-none -translate-y-1 border-transparent opacity-0'}"
				onmousedown={(e) => e.preventDefault()}
			>
				<Toolbar
					editor={editorInstance}
					onpickImage={() => (mediaPickerOpen = true)}
					{htmlBlockFocused}
				/>
			</div>
			<div class="mx-auto max-w-3xl py-8">
				<RichTextEditor
					bind:this={editorRef}
					initialContent={data.file.htmlContent}
					placeholder="Start writing..."
					onready={({ editor }) => {
						editorInstance = editor;
						initialMarkdown = currentMarkdown = getMarkdown();
					}}
					oncontentChange={() => {
						currentMarkdown = getMarkdown();
					}}
					onselectionUpdate={({ editor }) => (editorInstance = editor)}
				/>
				<InlineToolbar editor={editorInstance} {editorFocused} />
			</div>
		</div>

		<!-- Frontmatter tab -->
		{#if hasFrontmatter}
			<div class="flex-1 overflow-y-auto" class:hidden={activeTab !== 'frontmatter'}>
				<FrontmatterEditor
					bind:this={frontmatterRef}
					value={frontmatterValue}
					onchange={(v) => {
						frontmatterValue = v;
					}}
					fullscreen
				/>
			</div>
		{/if}
		<MediaPicker
			open={mediaPickerOpen}
			branch={data.branch}
			mediaPath={data.repo.mediaPath}
			onselect={({ imageUrl, fileName }) => {
				editorInstance
					?.chain()
					.focus()
					.insertContent(`<img src="${imageUrl}" alt="${fileName}">`)
					.run();
			}}
			onclose={() => (mediaPickerOpen = false)}
		/>

		{#if toastMessage}
			<div
				class="fixed bottom-6 left-1/2 z-60 -translate-x-1/2"
				transition:fly={{ y: 16, duration: 200 }}
			>
				<div
					class="flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium shadow-lg {toastMessage.type ===
					'success'
						? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
						: 'bg-red-600 text-white'}"
				>
					{toastMessage.text}
					<button
						type="button"
						onclick={() => (toastMessage = null)}
						class="ml-1 cursor-pointer opacity-60 transition-opacity hover:opacity-100"
					>
						<X size={14} />
					</button>
				</div>
			</div>
		{/if}
	</div>
{:else if isBrixEditing}
	<div class="fixed inset-0 z-50 flex flex-col bg-white dark:bg-[#111827]">
		<div
			class="relative z-30 flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700"
		>
			<div class="flex items-center gap-3">
				<button
					type="button"
					onclick={handleBack}
					class="text-muted hover:text-heading cursor-pointer transition-colors"
				>
					<ArrowLeft size={20} />
				</button>
				<span class="text-sm font-medium text-gray-900 dark:text-gray-100">{data.file.name}</span>
			</div>
			<form
				method="post"
				action="?/save"
				use:enhance={({ formData }) => {
					formData.set('brixYaml', currentBrixYaml);
					formData.set('sha', data.file.sha);
					saving = true;
					return async ({ result, update }) => {
						saving = false;
						if (result.type === 'success') {
							initialBrixYaml = currentBrixYaml;
							showToast('Saved successfully.');
						} else if (result.type === 'failure') {
							showToast((result.data as any)?.saveError ?? 'Save failed.', 'error');
						}
						await update({ reset: false });
					};
				}}
			>
				<button
					type="submit"
					disabled={saving || !brixDirty}
					class="inline-flex cursor-pointer items-center gap-2 bg-[#2563EB] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#3B82F6] disabled:cursor-not-allowed disabled:opacity-50"
				>
					{#if saving}
						<Spinner /> Committing…
					{:else}
						Commit
					{/if}
				</button>
			</form>
		</div>

		<div class="min-h-0 flex-1">
			{#if brixDefinitions.length > 0}
				<BrixEditor
					definitions={brixDefinitions}
					chrome="embedded"
					initialBrixYaml={data.file.brixYaml}
					onBrixYamlChange={(value) => {
						if (!brixYamlHydrated) {
							initialBrixYaml = value;
							brixYamlHydrated = true;
						}
						currentBrixYaml = value;
					}}
				/>
			{:else}
				<div class="mx-auto max-w-2xl px-6 py-16">
					<h1 class="font-display mb-2 text-3xl text-gray-900 dark:text-gray-50">
						No brix components found
					</h1>
					<p class="text-muted">
						Add Svelte components under <code>$lib/brixter/brix</code> to edit this brix page.
					</p>
				</div>
			{/if}
		</div>

		{#if toastMessage}
			<div
				class="fixed bottom-6 left-1/2 z-60 -translate-x-1/2"
				transition:fly={{ y: 16, duration: 200 }}
			>
				<div
					class="flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium shadow-lg {toastMessage.type ===
					'success'
						? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
						: 'bg-red-600 text-white'}"
				>
					{toastMessage.text}
					<button
						type="button"
						onclick={() => (toastMessage = null)}
						class="ml-1 cursor-pointer opacity-60 transition-opacity hover:opacity-100"
					>
						<X size={14} />
					</button>
				</div>
			</div>
		{/if}
	</div>
{:else if isUnsupportedFile}
	<div class="mx-auto max-w-2xl px-6 py-16">
		<a href={backHref} class="text-secondary hover:text-heading text-sm transition-colors">
			← Back to routes
		</a>
		<h1 class="font-display mt-4 mb-2 text-3xl text-gray-900 dark:text-gray-50">
			{data.file.name}
		</h1>
		<p class="text-muted">
			This SvelteKit page is visible in the explorer, but only Markdown and brix page files are
			editable right now.
		</p>
	</div>
{:else}
	{#if data.behindBy > 0}
		<div
			class="sticky top-0 z-40 border-b border-amber-400 bg-amber-50 px-5 py-3 dark:border-amber-600 dark:bg-amber-950"
		>
			<div class="mx-auto flex max-w-2xl items-center gap-3">
				<AlertTriangle size={16} class="shrink-0 text-amber-600 dark:text-amber-400" />
				<p class="flex-1 text-sm font-medium text-amber-800 dark:text-amber-200">
					Routes could not be updated from main automatically.
					{#if data.syncError}
						<span class="font-normal">{data.syncError}</span>
					{:else}
						<span class="font-normal">
							The draft is {data.behindBy} commit{data.behindBy > 1 ? 's' : ''} behind main.
						</span>
					{/if}
					{#if !data.isAdmin}
						<span class="font-normal">Contact an admin to resolve it.</span>
					{/if}
				</p>
				{#if data.isAdmin}
					{#if form?.mergeSuccess}
						<span class="text-sm text-green-700 dark:text-green-400">Merged!</span>
					{:else}
						<form
							method="post"
							action="?/merge"
							use:enhance={() => {
								merging = true;
								return async ({ update }) => {
									merging = false;
									await update({ reset: false });
								};
							}}
						>
							<button
								type="submit"
								disabled={merging}
								class="inline-flex cursor-pointer items-center gap-2 bg-amber-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-amber-600 dark:hover:bg-amber-500"
							>
								{#if merging}
									<Spinner /> Updating…
								{:else}
									Retry update
								{/if}
							</button>
						</form>
					{/if}
					{#if form?.mergeError}
						<span class="text-error text-sm">{form.mergeError}</span>
					{/if}
				{/if}
			</div>
		</div>
	{/if}

	<!-- File explorer -->
	<div class="mx-auto max-w-2xl px-6 py-16">
		{#if !isRoutesRoot}
			<a href="/admin/routes" class="text-secondary hover:text-heading text-sm transition-colors">
				← Back to routes
			</a>
		{/if}

		<h1 class="font-display mt-4 mb-2 text-3xl text-gray-900 dark:text-gray-50">
			Routes
		</h1>
		<p class="text-secondary mb-8">{data.repo.fullName}</p>

		{#if breadcrumbs.length > 0}
			<div class="text-muted mb-8 flex items-center gap-1 text-sm">
				{#each breadcrumbs as crumb, i}
					{#if i > 0}
						<ChevronRight size={14} />
					{/if}
					{#if i < breadcrumbs.length - 1}
						<a
							href={routesHref(crumb.path)}
							class="text-secondary hover:text-heading transition-colors">{crumb.label}</a
						>
					{:else}
						<span class="text-heading inline-flex items-center gap-2">
							{crumb.label}
							{#if crumb.fileTypeLabel}
								<span
									class="text-muted rounded bg-gray-100 px-1.5 py-0.5 text-[10px] tracking-wide uppercase dark:bg-gray-700 dark:text-gray-300"
								>
									{crumb.fileTypeLabel}
								</span>
							{/if}
						</span>
					{/if}
				{/each}
			</div>
		{/if}

		<div class="mb-4 flex items-center justify-end gap-4">
			<button
				type="button"
				onclick={startAddingPage}
				disabled={addingPage || addingDirectory}
				class="text-secondary hover:text-heading inline-flex cursor-pointer items-center gap-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50"
			>
				<FilePlus size={16} />
				New page
			</button>
			<button
				type="button"
				onclick={startAddingDirectory}
				disabled={addingDirectory || addingPage}
				class="text-secondary hover:text-heading inline-flex cursor-pointer items-center gap-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50"
			>
				<FolderPlus size={16} />
				New directory
			</button>
		</div>

		{#if addingDirectory && duplicateDirectory}
			<p class="text-error mb-3 text-sm">A route named “{trimmedDirectoryName}” already exists.</p>
		{:else if form?.createDirectoryError}
			<p class="text-error mb-3 text-sm">{form.createDirectoryError}</p>
		{:else if addingPage && duplicatePage}
			<p class="text-error mb-3 text-sm">A route named “{trimmedPageName}” already exists.</p>
		{:else if form?.createPageError}
			<p class="text-error mb-3 text-sm">{form.createPageError}</p>
		{/if}

		{#if parentPath !== null}
			<a
				href={routesHref(parentPath)}
				class="text-secondary hover:text-heading flex cursor-pointer items-center gap-3 border border-b-0 border-gray-300 bg-white px-5 py-4 transition-colors hover:bg-gray-100 dark:border-gray-700 dark:bg-[#1f2937] dark:hover:bg-gray-700"
			>
				..
			</a>
		{/if}

		<div class="border border-gray-300 bg-white dark:border-gray-700 dark:bg-[#1f2937]">
			{#if data.entries.length > 0 || addingPage || addingDirectory}
				<ul class="divide-y divide-gray-300 dark:divide-gray-700">
					{#each data.entries as entry}
						<li>
							{#if entry.kind === 'page' && isImage(entry.label)}
								<button
									type="button"
									onclick={() => (lightbox = { name: entry.label, url: entry.downloadUrl })}
									class="flex w-full cursor-pointer items-center gap-3 px-5 py-4 text-left text-gray-900 transition-colors hover:bg-gray-100 dark:text-gray-100 dark:hover:bg-gray-700"
								>
									<Image size={18} class="text-muted" />
									{entry.label}
								</button>
							{:else if entry.disabled}
								<div
									class="text-muted flex cursor-not-allowed items-center gap-3 px-5 py-4 opacity-70"
									aria-disabled="true"
								>
									<FileText size={18} class="text-muted" />
									<span class="min-w-0 flex-1">{entry.label}</span>
									{#if entry.fileTypeLabel}
										<span
											class="text-muted rounded bg-gray-100 px-1.5 py-0.5 text-[10px] tracking-wide uppercase dark:bg-gray-700 dark:text-gray-300"
										>
											{entry.fileTypeLabel}
										</span>
									{/if}
								</div>
							{:else}
								<a
									href={routesHref(entry.path)}
									class="flex cursor-pointer items-center gap-3 px-5 py-4 text-gray-900 transition-colors hover:bg-gray-100 dark:text-gray-100 dark:hover:bg-gray-700"
								>
									{#if entry.kind === 'route'}
										<Folder size={18} class="text-muted" />
									{:else}
										<FileText size={18} class="text-muted" />
									{/if}
									<span class="min-w-0 flex-1">{entry.label}</span>
									{#if entry.fileTypeLabel}
										<span
											class="text-muted rounded bg-gray-100 px-1.5 py-0.5 text-[10px] tracking-wide uppercase dark:bg-gray-700 dark:text-gray-300"
										>
											{entry.fileTypeLabel}
										</span>
									{/if}
								</a>
							{/if}
						</li>
					{/each}
					{#if addingPage}
						<li>
							<form
								method="post"
								action="?/createPage"
								class="flex items-center gap-3 px-5 py-4"
								use:enhance={({ cancel }) => {
									if (!trimmedPageName || duplicatePage) {
										cancel();
										return;
									}
									creatingPage = true;
									return async ({ result, update }) => {
										creatingPage = false;
										if (result.type === 'redirect' || result.type === 'success') {
											addingPage = false;
											pageName = '';
										}
										await update();
									};
								}}
							>
								<FileText size={18} class="text-muted shrink-0" />
								<input
									use:focusOnMount
									name="page_name"
									value={pageName}
									placeholder="page-name"
									aria-label="New page name"
									disabled={creatingPage}
									oninput={(e: Event) => (pageName = (e.target as HTMLInputElement).value)}
									onkeydown={(e: KeyboardEvent) => {
										if (e.key === 'Escape') cancelAddingPage();
									}}
									onblur={() => {
										if (!pageName.trim() && !creatingPage) cancelAddingPage();
									}}
									class="min-w-0 flex-1 bg-transparent text-gray-900 outline-none dark:text-gray-100"
								/>
								<span class="text-muted shrink-0">.brix.yaml</span>
								{#if creatingPage}
									<Spinner />
								{/if}
							</form>
						</li>
					{/if}
					{#if addingDirectory}
						<li>
							<form
								method="post"
								action="?/createDirectory"
								class="flex items-center gap-3 px-5 py-4"
								use:enhance={({ cancel }) => {
									if (!trimmedDirectoryName || duplicateDirectory) {
										cancel();
										return;
									}
									creatingDirectory = true;
									return async ({ result, update }) => {
										creatingDirectory = false;
										if (result.type === 'redirect' || result.type === 'success') {
											addingDirectory = false;
											directoryName = '';
										}
										await update();
									};
								}}
							>
								<Folder size={18} class="text-muted shrink-0" />
								<input
									use:focusOnMount
									name="directory_name"
									value={directoryName}
									placeholder="directory-name"
									aria-label="New directory name"
									disabled={creatingDirectory}
									oninput={(e: Event) => (directoryName = (e.target as HTMLInputElement).value)}
									onkeydown={(e: KeyboardEvent) => {
										if (e.key === 'Escape') cancelAddingDirectory();
									}}
									onblur={() => {
										if (!directoryName.trim() && !creatingDirectory) cancelAddingDirectory();
									}}
									class="min-w-0 flex-1 bg-transparent text-gray-900 outline-none dark:text-gray-100"
								/>
								{#if creatingDirectory}
									<Spinner />
								{/if}
							</form>
						</li>
					{/if}
				</ul>
			{:else}
				<p class="text-muted py-8 text-center text-sm">There's nothing here.</p>
			{/if}
		</div>
	</div>
{/if}

{#if lightbox}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-8"
		onkeydown={(e) => {
			if (e.key === 'Escape') lightbox = null;
		}}
		onclick={(e) => {
			if (e.target === e.currentTarget) lightbox = null;
		}}
	>
		<button
			type="button"
			onclick={() => (lightbox = null)}
			class="absolute top-4 right-4 cursor-pointer text-white/70 transition-colors hover:text-white"
			aria-label="Close"
		>
			<X size={24} />
		</button>
		<div class="flex max-h-full max-w-full flex-col items-center gap-4">
			<img src={lightbox.url} alt={lightbox.name} class="max-h-[80vh] max-w-full object-contain" />
			<p class="text-sm text-white/70">{lightbox.name}</p>
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
