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
		ArrowLeft,
		Command,
		Monitor,
		Tablet,
		Smartphone,
		Eye,
		Edit2,
		Ellipsis,
		Pencil,
		Trash2
	} from 'lucide-svelte';
	import { Spinner } from 'brixter/ui';
	import {
		BrixEditor,
		createBrixDefinitions,
		createMarkupBrixDefinitions,
		createLayoutDefinitions,
		SHORTCUTS
	} from '@brixter/brix-builder';
	import { MediaPicker, IconPicker } from 'brixter/editor';
	import { onMount } from 'svelte';
	import { fly } from 'svelte/transition';

	let { data, form }: { data: any; form: any } = $props();

	const brixDefinitions = [
		// Hand-written Svelte component brix (escape hatch for advanced cases).
		...createBrixDefinitions(
			import.meta.glob('$lib/brixter/brix/*.svelte', { eager: true }),
			import.meta.glob('$lib/brixter/brix/*.svelte', {
				query: '?raw',
				import: 'default',
				eager: true
			}) as Record<string, string>
		),
		// Plain `.brix` markup files, interpreted at runtime — no Svelte compilation.
		...createMarkupBrixDefinitions(
			import.meta.glob('$lib/brixter/brix/*.brix', {
				query: '?raw',
				import: 'default',
				eager: true
			}) as Record<string, string>
		)
	];

	const layoutDefinitions = createLayoutDefinitions(
		import.meta.glob('$lib/brixter/layouts/*.svelte', { eager: true }),
		import.meta.glob('$lib/brixter/layouts/*.svelte', {
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
	let pageFlowOpen = $state(true);
	let inspectorOpen = $state(true);
	let builderActiveBlockId = $state<string | null>(null);
	let pageFlowShortcutModifier = $state<'command' | 'control'>('command');
	let builderPreviewMode = $state(false);
	let builderViewportSize = $state<'desktop' | 'tablet' | 'mobile'>('desktop');
	let deleteTarget = $state<{
		kind: 'page' | 'route';
		path: string;
		label: string;
		routeDirPath: string;
		filePath?: string;
	} | null>(null);
	let deleting = $state(false);
	let openMenuPath = $state<string | null>(null);
	let renameTarget = $state<{
		kind: 'page' | 'route';
		path: string;
		label: string;
		routeDirPath: string;
	} | null>(null);
	let renameName = $state('');
	let renaming = $state(false);

	let mediaPickerOpen = $state(false);
	let builderImagePickCallback = $state<((url: string) => void) | null>(null);
	let iconPickerOpen = $state(false);
	let builderIconPickCallback = $state<((iconSvg: string) => void) | null>(null);
	let toastMessage = $state<{ text: string; type: 'success' | 'error' } | null>(null);
	let toastTimeout: ReturnType<typeof setTimeout> | undefined;

	let initialBrixYaml = $state('');
	let currentBrixYaml = $state('');
	let brixYamlHydrated = $state(false);
	let loadedFilePath = $state<string | null>(null);
	const brixDirty = $derived(currentBrixYaml !== initialBrixYaml);
	const isDirty = $derived(brixDirty);

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
	const routesRoot = $derived(
		normalizeRoutesRoot(data.repo?.routesRoot ?? data.explorerRoot ?? '')
	);
	const trimmedRenameName = $derived(renameName.trim());
	const renameOldSegment = $derived(
		renameTarget ? routeSegmentName(renameTarget.routeDirPath) : ''
	);
	const duplicateRename = $derived(
		trimmedRenameName.length > 0 &&
			trimmedRenameName.toLowerCase() !== renameOldSegment.toLowerCase() &&
			(existingDirNames.has(trimmedRenameName.toLowerCase()) ||
				existingPageNames.has(trimmedRenameName.toLowerCase()))
	);

	function normalizeRoutesRoot(value: string) {
		return value.trim().replace(/^\/+|\/+$/g, '');
	}

	function routeSegmentName(routeDirPath: string) {
		return routeDirPath.split('/').pop() ?? '';
	}

	function canRenameEntry(entry: { routeDirPath?: string }) {
		return !!entry.routeDirPath && entry.routeDirPath !== routesRoot;
	}

	function canShowEntryMenu(entry: { routeDirPath?: string }) {
		return !!entry.routeDirPath;
	}

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

	function beginDelete(entry: {
		kind: 'page' | 'route';
		path: string;
		label: string;
		routeDirPath?: string;
		filePath?: string;
	}) {
		if (!entry.routeDirPath) return;
		cancelRename();
		openMenuPath = null;
		deleteTarget = {
			kind: entry.kind,
			path: entry.path,
			label: entry.label,
			routeDirPath: entry.routeDirPath,
			filePath: entry.filePath
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

	function startRename(entry: {
		kind: 'page' | 'route';
		path: string;
		label: string;
		routeDirPath?: string;
	}) {
		if (!canRenameEntry(entry)) return;
		cancelDelete();
		openMenuPath = null;
		renameTarget = {
			kind: entry.kind,
			path: entry.path,
			label: entry.label,
			routeDirPath: entry.routeDirPath!
		};
		renameName = routeSegmentName(entry.routeDirPath!);
	}

	function cancelRename() {
		renameTarget = null;
		renameName = '';
	}

	function toggleEntryMenu(path: string) {
		openMenuPath = openMenuPath === path ? null : path;
	}

	function focusOnMount(node: HTMLInputElement) {
		node.focus();
	}

	function showToast(text: string, type: 'success' | 'error' = 'success') {
		clearTimeout(toastTimeout);
		toastMessage = { text, type };
		toastTimeout = setTimeout(() => {
			toastMessage = null;
		}, 3000);
	}

	const base = '/admin/routes';
	const isBrixEditing = $derived(data.file?.brixYaml !== undefined);
	const backHref = $derived(data.parentPath ? routesHref(data.parentPath) : base);
	const isUnsupportedFile = $derived(!!data.file && !isBrixEditing);

	const breadcrumbs = $derived(data.breadcrumbs ?? []);
	const isRoutesRoot = $derived(!data.parentPath && breadcrumbs.length === 0);

	$effect(() => {
		const file = data.file;
		const filePath = file?.path ?? null;
		if (filePath === loadedFilePath) return;

		loadedFilePath = filePath;
		const nextBrixYaml = file?.brixYaml ?? '';
		initialBrixYaml = nextBrixYaml;
		currentBrixYaml = nextBrixYaml;
		brixYamlHydrated = false;
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

	const mediaPrefix = $derived(
		data.repo.mediaPath ? data.repo.mediaPath.replace(/\/$/, '') + '/' : ''
	);

	function transformGithubUrlToRelative(src: string): string {
		if (/^https:\/\/raw\.githubusercontent\.com\//.test(src)) {
			const match = src.match(/^https:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/[^/]+\/(.+)$/);
			let repoPath = match ? match[1].split('?')[0] : src;
			if (mediaPrefix && repoPath.startsWith(mediaPrefix)) {
				repoPath = repoPath.slice(mediaPrefix.length);
			}
			return `/${repoPath}`;
		}
		return src;
	}

	/**
	 * Render-time rewrite for image `src` in the builder preview. The persisted
	 * value is a portable root-absolute media path (e.g. `/image.png`) that the
	 * deployed site serves from its static build. In GitHub mode a freshly uploaded
	 * image only lives on the draft branch, so resolve it through the draft-aware
	 * proxy `/admin/api/repo-image` (re-adding the media root) so it shows in the
	 * preview before publish. Local mode already serves it from disk → identity.
	 */
	function resolvePreviewImageSrc(src: string): string {
		if (data.isLocal || !src) return src;
		if (/^(https?:)?\/\//.test(src) || src.startsWith('data:')) return src;
		if (src.startsWith('/admin/api/repo-image')) return src;
		if (!src.startsWith('/')) return src;
		const repoPath = `${mediaPrefix}${src.slice(1)}`;
		return `/admin/api/repo-image?branch=${encodeURIComponent(data.branch)}&path=${encodeURIComponent(repoPath)}`;
	}

	function handleBack() {
		window.location.href = backHref;
	}

	onMount(() => {
		pageFlowShortcutModifier = /Mac|iPhone|iPad|iPod/.test(navigator.platform)
			? 'command'
			: 'control';

		const handler = (e: BeforeUnloadEvent) => {
			if (isDirty) {
				e.preventDefault();
			}
		};
		window.addEventListener('beforeunload', handler);

		const closeMenuOnClick = (e: MouseEvent) => {
			if (!(e.target as Element).closest('[data-entry-menu]')) {
				openMenuPath = null;
			}
		};
		document.addEventListener('click', closeMenuOnClick);

		return () => {
			window.removeEventListener('beforeunload', handler);
			document.removeEventListener('click', closeMenuOnClick);
		};
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

{#if isBrixEditing}
	<div class="fixed inset-0 z-50 flex flex-col bg-white dark:bg-gray-900">
		<div
			class="relative z-30 flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700"
			onclick={(event) => {
				if (!(event.target as Element).closest('button, input, a')) builderActiveBlockId = null;
			}}
		>
			<div class="flex items-center gap-3">
				<button
					type="button"
					onclick={handleBack}
					class="inline-flex h-10 w-10 cursor-pointer items-center justify-center border border-gray-300 bg-white text-gray-900 transition-colors hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
				>
					<ArrowLeft size={20} />
				</button>
				{#if !builderPreviewMode}
					<button
						type="button"
						class={pageFlowOpen
							? 'bx-btn-brutal-icon group relative inline-flex h-10 w-10 items-center justify-center'
							: 'group hover:bx-border-accent hover:bx-bg-accent-hover dark:hover:bx-border-accent dark:hover:bx-bg-accent-hover relative inline-flex h-10 w-10 cursor-pointer items-center justify-center border border-gray-300 bg-white text-gray-900 transition-colors hover:text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:hover:text-gray-900'}
						aria-label={pageFlowOpen ? 'Chiudi Page flow' : 'Apri Page flow'}
						aria-pressed={pageFlowOpen}
						onclick={() => (pageFlowOpen = !pageFlowOpen)}
					>
						<svg class="h-4 w-4" viewBox="0 0 16 16" aria-hidden="true">
							<path
								d="M3 3.5h10v1.25H3V3.5Zm0 3.875h10v1.25H3v-1.25Zm0 3.875h10v1.25H3v-1.25Z"
								fill="currentColor"
							/>
						</svg>
						<span
							class="pointer-events-none absolute top-full right-0 z-50 mt-2 flex flex-col items-start gap-1.5 border-2 border-gray-200 bg-white px-3 py-2 text-xs whitespace-nowrap text-gray-900 opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
						>
							<span class="font-semibold">Page flow</span>
							<span class="flex items-center gap-1 text-gray-500 dark:text-gray-400">
								<span
									class="inline-flex h-5 items-center gap-1 border-2 border-gray-200 bg-gray-50 px-1.5 text-[11px] font-medium text-gray-700 dark:border-gray-500 dark:bg-gray-800 dark:text-gray-200"
								>
									{#if pageFlowShortcutModifier === 'command'}
										<Command size={12} strokeWidth={2} />
									{:else}
										Ctrl
									{/if}
								</span>
								<span class="text-[11px] font-semibold text-gray-400 dark:text-gray-500">+</span>
								<span
									class="inline-flex h-5 items-center border-2 border-gray-200 bg-gray-50 px-1.5 text-[11px] font-medium text-gray-700 dark:border-gray-500 dark:bg-gray-800 dark:text-gray-200"
								>
									{SHORTCUTS.togglePageFlow.key}
								</span>
							</span>
						</span>
					</button>
				{/if}
			</div>

			<!-- Center Device Selection -->
			<div
				class="absolute top-1/2 left-1/2 z-10 inline-flex -translate-x-1/2 -translate-y-1/2 items-center gap-0.5 border-2 border-gray-200/50 bg-gray-100 p-0.5 shadow-inner dark:border-gray-700/50 dark:bg-gray-800/80"
			>
				<button
					type="button"
					class="inline-flex h-9 w-9 cursor-pointer items-center justify-center transition-all duration-150 {builderViewportSize ===
					'desktop'
						? 'bg-white font-medium text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white'
						: 'bg-transparent text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'}"
					onclick={() => (builderViewportSize = 'desktop')}
					title="Desktop (100%)"
				>
					<Monitor size={18} />
				</button>
				<button
					type="button"
					class="inline-flex h-9 w-9 cursor-pointer items-center justify-center transition-all duration-150 {builderViewportSize ===
					'tablet'
						? 'bg-white font-medium text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white'
						: 'bg-transparent text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'}"
					onclick={() => (builderViewportSize = 'tablet')}
					title="Tablet (768px)"
				>
					<svg
						class="h-[18px] w-[18px]"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						><rect x="2" y="4" width="20" height="16" rx="2" ry="2" /><line
							x1="18"
							x2="18.01"
							y1="12"
							y2="12"
						/></svg
					>
				</button>
				<button
					type="button"
					class="inline-flex h-9 w-9 cursor-pointer items-center justify-center transition-all duration-150 {builderViewportSize ===
					'mobile'
						? 'bg-white font-medium text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white'
						: 'bg-transparent text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'}"
					onclick={() => (builderViewportSize = 'mobile')}
					title="Mobile (375px)"
				>
					<Smartphone size={18} />
				</button>
			</div>
			<div class="flex items-center gap-2">
				<!-- Mode Selector -->
				<div
					class="group relative inline-flex items-center gap-0.5 border-2 border-gray-200/50 bg-gray-100 p-0.5 shadow-inner dark:border-gray-700/50 dark:bg-gray-800/80"
				>
					<button
						type="button"
						class="inline-flex h-9 cursor-pointer items-center gap-2 px-3 text-sm font-medium transition-all duration-150 {!builderPreviewMode
							? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white'
							: 'bg-transparent text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'}"
						onclick={() => (builderPreviewMode = false)}
					>
						<Edit2 size={16} />
						<span>Editor</span>
					</button>
					<button
						type="button"
						class="inline-flex h-9 cursor-pointer items-center gap-2 px-3 text-sm font-medium transition-all duration-150 {builderPreviewMode
							? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white'
							: 'bg-transparent text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'}"
						onclick={() => {
							builderPreviewMode = true;
							builderActiveBlockId = null;
						}}
					>
						<Eye size={16} />
						<span>Preview</span>
					</button>
					<span
						class="pointer-events-none absolute top-full right-0 z-50 mt-2 flex flex-col items-start gap-1.5 border-2 border-gray-200 bg-white px-3 py-2 text-xs whitespace-nowrap text-gray-900 opacity-0 shadow-lg transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
					>
						<span class="font-semibold">Preview</span>
						<span class="flex items-center gap-1 text-gray-500 dark:text-gray-400">
							<span
								class="inline-flex h-5 items-center gap-1 border-2 border-gray-200 bg-gray-50 px-1.5 text-[11px] font-medium text-gray-700 dark:border-gray-500 dark:bg-gray-800 dark:text-gray-200"
							>
								{#if pageFlowShortcutModifier === 'command'}
									<Command size={12} strokeWidth={2} />
								{:else}
									Ctrl
								{/if}
							</span>
							<span class="text-[11px] font-semibold text-gray-400 dark:text-gray-500">+</span>
							<span
								class="inline-flex h-5 items-center border-2 border-gray-200 bg-gray-50 px-1.5 text-[11px] font-medium text-gray-700 uppercase dark:border-gray-500 dark:bg-gray-800 dark:text-gray-200"
							>
								{SHORTCUTS.togglePreview.key}
							</span>
						</span>
					</span>
				</div>

				{#if !builderPreviewMode}
					<button
						type="button"
						class={inspectorOpen
							? 'bx-btn-brutal-icon group relative inline-flex h-10 w-10 items-center justify-center'
							: 'group hover:bx-border-accent hover:bx-bg-accent-hover dark:hover:bx-border-accent dark:hover:bx-bg-accent-hover relative inline-flex h-10 w-10 cursor-pointer items-center justify-center border border-gray-300 bg-white text-gray-900 transition-colors hover:text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:hover:text-gray-900'}
						aria-label={inspectorOpen ? 'Chiudi Inspector' : 'Apri Inspector'}
						aria-pressed={inspectorOpen}
						onclick={() => (inspectorOpen = !inspectorOpen)}
					>
						<svg class="h-4 w-4" viewBox="0 0 16 16" fill="none" aria-hidden="true">
							<rect
								x="2"
								y="2"
								width="12"
								height="12"
								rx="1.5"
								stroke="currentColor"
								stroke-width="1.25"
							/>
							<path d="M10.5 2.5v11" stroke="currentColor" stroke-width="1.25" />
						</svg>
						<span
							class="pointer-events-none absolute top-full right-0 z-50 mt-2 flex flex-col items-start gap-1.5 border-2 border-gray-200 bg-white px-3 py-2 text-xs whitespace-nowrap text-gray-900 opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
						>
							<span class="font-semibold">Inspector</span>
							<span class="flex items-center gap-1 text-gray-500 dark:text-gray-400">
								<span
									class="inline-flex h-5 items-center gap-1 border-2 border-gray-200 bg-gray-50 px-1.5 text-[11px] font-medium text-gray-700 dark:border-gray-500 dark:bg-gray-800 dark:text-gray-200"
								>
									{#if pageFlowShortcutModifier === 'command'}
										<Command size={12} strokeWidth={2} />
									{:else}
										Ctrl
									{/if}
								</span>
								<span class="text-[11px] font-semibold text-gray-400 dark:text-gray-500">+</span>
								<span
									class="inline-flex h-5 items-center border-2 border-gray-200 bg-gray-50 px-1.5 text-[11px] font-medium text-gray-700 dark:border-gray-500 dark:bg-gray-800 dark:text-gray-200"
									>Shift</span
								>
								<span class="text-[11px] font-semibold text-gray-400 dark:text-gray-500">+</span>
								<span
									class="inline-flex h-5 items-center border-2 border-gray-200 bg-gray-50 px-1.5 text-[11px] font-medium text-gray-700 dark:border-gray-500 dark:bg-gray-800 dark:text-gray-200"
								>
									{SHORTCUTS.toggleInspector.key}
								</span>
							</span>
						</span>
					</button>
				{/if}
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
						class="bx-btn-brutal-flat inline-flex h-10 cursor-pointer items-center gap-2 px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
					>
						{#if saving}
						<Spinner /> {data.isLocal ? 'Saving…' : 'Committing…'}
					{:else}
						{data.isLocal ? 'Save' : 'Commit'}
					{/if}
					</button>
				</form>
			</div>
		</div>

		<div class="min-h-0 flex-1">
			{#if brixDefinitions.length > 0}
				<BrixEditor
					definitions={brixDefinitions}
					layouts={layoutDefinitions}
					chrome="embedded"
					bind:pageFlowOpen
					bind:inspectorOpen
					bind:activeBlockId={builderActiveBlockId}
					initialBrixYaml={data.file.brixYaml}
					bind:previewMode={builderPreviewMode}
					bind:viewportSize={builderViewportSize}
					onBrixYamlChange={(value) => {
						if (!brixYamlHydrated) {
							initialBrixYaml = value;
							brixYamlHydrated = true;
						}
						currentBrixYaml = value;
					}}
					onpickImage={(callback) => {
						builderImagePickCallback = (url) => {
							const relativeUrl = transformGithubUrlToRelative(url);
							callback(relativeUrl);
						};
						mediaPickerOpen = true;
					}}
					onpickIcon={(callback) => {
						builderIconPickCallback = callback;
						iconPickerOpen = true;
					}}
					resolveImageSrc={resolvePreviewImageSrc}
				/>
			{:else}
				<div class="mx-auto max-w-2xl px-6 py-16">
					<h1 class="bx-font-display mb-2 text-3xl text-gray-900 dark:text-gray-50">
						No brix components found
					</h1>
					<p class="bx-text-muted">
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
		<a href={backHref} class="bx-text-secondary hover:bx-text-heading text-sm transition-colors">
			← Back to routes
		</a>
		<h1 class="bx-font-display mt-4 mb-2 text-3xl text-gray-900 dark:text-gray-50">
			{data.file.name}
		</h1>
		<p class="bx-text-muted">
			This SvelteKit page is visible in the explorer, but only brix page files are editable right now.
		</p>
	</div>
{:else}
	{#if data.aheadBy > 0}
		<div
			class="sticky top-0 z-40 border-b-2 border-gray-300 bg-white px-5 py-3 dark:border-gray-700 dark:bg-gray-800"
		>
			<div class="mx-auto flex max-w-2xl items-center justify-between gap-3">
				<p class="text-sm font-medium text-gray-900 dark:text-gray-100">
					You have {data.aheadBy} unpublished commit{data.aheadBy > 1 ? 's' : ''} ready to publish.
				</p>
				<a
					href="/admin/publish"
					class="bx-btn-brutal-flat inline-flex shrink-0 items-center gap-2 px-3 py-1.5 text-sm font-medium"
				>
					Review & Publish
				</a>
			</div>
		</div>
	{/if}

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
				</p>
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
					<span class="bx-text-error text-sm">{form.mergeError}</span>
				{/if}
			</div>
		</div>
	{/if}

	<!-- File explorer -->
	<div class="mx-auto max-w-2xl px-6 py-16">
		{#if !isRoutesRoot}
			<a href="/admin/routes" class="bx-text-secondary hover:bx-text-heading text-sm transition-colors">
				← Back to routes
			</a>
		{/if}

		<h1 class="bx-font-display mt-4 mb-2 text-3xl text-gray-900 dark:text-gray-50">Routes</h1>
		<p class="bx-text-secondary mb-8">{data.repo.fullName}</p>

		{#if breadcrumbs.length > 0}
			<div class="bx-text-muted mb-8 flex items-center gap-1 text-sm">
				{#each breadcrumbs as crumb, i}
					{#if i > 0}
						<ChevronRight size={14} />
					{/if}
					{#if i < breadcrumbs.length - 1}
						<a
							href={routesHref(crumb.path)}
							class="bx-text-secondary hover:bx-text-heading transition-colors">{crumb.label}</a
						>
					{:else}
						<span class="bx-text-heading">{crumb.label}</span>
					{/if}
				{/each}
			</div>
		{/if}

		<div class="mb-4 flex items-center justify-end gap-4">
			<button
				type="button"
				onclick={startAddingPage}
				disabled={addingPage || addingDirectory}
				class="bx-text-secondary hover:bx-text-heading inline-flex cursor-pointer items-center gap-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50"
			>
				<FilePlus size={16} />
				New page
			</button>
			<button
				type="button"
				onclick={startAddingDirectory}
				disabled={addingDirectory || addingPage}
				class="bx-text-secondary hover:bx-text-heading inline-flex cursor-pointer items-center gap-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50"
			>
				<FolderPlus size={16} />
				New directory
			</button>
		</div>

		{#if addingDirectory && duplicateDirectory}
			<p class="bx-text-error mb-3 text-sm">A route named “{trimmedDirectoryName}” already exists.</p>
		{:else if form?.createDirectoryError}
			<p class="bx-text-error mb-3 text-sm">{form.createDirectoryError}</p>
		{:else if addingPage && duplicatePage}
			<p class="bx-text-error mb-3 text-sm">A route named “{trimmedPageName}” already exists.</p>
		{:else if form?.createPageError}
			<p class="bx-text-error mb-3 text-sm">{form.createPageError}</p>
		{:else if form?.deleteError}
			<p class="bx-text-error mb-3 text-sm">{form.deleteError}</p>
		{:else if renameTarget && duplicateRename}
			<p class="bx-text-error mb-3 text-sm">A route named “{trimmedRenameName}” already exists.</p>
		{:else if form?.renameError}
			<p class="bx-text-error mb-3 text-sm">{form.renameError}</p>
		{/if}

		{#if parentPath !== null}
			<a
				href={routesHref(parentPath)}
				class="bx-text-secondary hover:bx-text-heading flex cursor-pointer items-center gap-3 border-2 border-b-0 border-gray-300 bg-white px-5 py-4 transition-colors hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700"
			>
				..
			</a>
		{/if}

		<div class="border-2 border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-800">
			{#if data.entries.length > 0 || addingPage || addingDirectory}
				<ul class="divide-y divide-gray-300 dark:divide-gray-700">
					{#each data.entries as entry}
						<li>
							{#if renameTarget && renameTarget.path === entry.path}
								<form
									method="post"
									action="?/renameRoute"
									class="flex items-center gap-3 px-5 py-4"
									use:enhance={({ cancel }) => {
										if (!trimmedRenameName || duplicateRename) {
											cancel();
											return;
										}
										renaming = true;
										return async ({ result, update }) => {
											renaming = false;
											if (result.type === 'redirect' || result.type === 'success') {
												cancelRename();
											}
											await update();
										};
									}}
								>
									{#if entry.kind === 'route'}
										<Folder size={18} class="bx-text-muted shrink-0" />
									{:else}
										<FileText size={18} class="bx-text-muted shrink-0" />
									{/if}
									<input type="hidden" name="routeDirPath" value={renameTarget.routeDirPath} />
									<input
										use:focusOnMount
										name="new_name"
										value={renameName}
										aria-label="New name"
										disabled={renaming}
										oninput={(e: Event) => (renameName = (e.target as HTMLInputElement).value)}
										onkeydown={(e: KeyboardEvent) => {
											if (e.key === 'Escape') cancelRename();
										}}
										class="min-w-0 flex-1 bg-transparent text-gray-900 outline-none dark:text-gray-100"
									/>
									<button
										type="button"
										onclick={cancelRename}
										disabled={renaming}
										class="bx-text-secondary hover:bx-text-heading shrink-0 cursor-pointer px-2 text-sm disabled:opacity-50"
									>
										Cancel
									</button>
									{#if renaming}
										<Spinner />
									{/if}
								</form>
							{:else}
								<div
									class="group flex w-full items-stretch transition-colors hover:bg-gray-100 dark:hover:bg-gray-700"
								>
									{#if entry.kind === 'page' && isImage(entry.label)}
										<button
											type="button"
											onclick={() => (lightbox = { name: entry.label, url: entry.downloadUrl })}
											class="flex min-w-0 flex-1 cursor-pointer items-center gap-3 px-5 py-4 text-left text-gray-900 dark:text-gray-100"
										>
											<Image size={18} class="bx-text-muted" />
											{entry.label}
										</button>
									{:else if entry.disabled}
										<div
											class="bx-text-muted flex min-w-0 flex-1 cursor-not-allowed items-center gap-3 px-5 py-4 opacity-70"
											aria-disabled="true"
										>
											<FileText size={18} class="bx-text-muted" />
											<span class="min-w-0 flex-1">{entry.label}</span>
										</div>
									{:else}
										<a
											href={routesHref(entry.path)}
											class="flex min-w-0 flex-1 cursor-pointer items-center gap-3 px-5 py-4 text-gray-900 dark:text-gray-100"
										>
											{#if entry.kind === 'route'}
												<Folder size={18} class="bx-text-muted" />
											{:else}
												<FileText size={18} class="bx-text-muted" />
											{/if}
											<span class="min-w-0 flex-1">{entry.label}</span>
										</a>
									{/if}
									{#if canShowEntryMenu(entry)}
										<div class="relative flex shrink-0 items-center pr-3" data-entry-menu>
											<button
												type="button"
												onclick={(e) => {
													e.stopPropagation();
													toggleEntryMenu(entry.path);
												}}
												class="bx-text-muted group-hover:bx-text-heading inline-flex h-full cursor-pointer items-center justify-center px-2 py-4 transition-colors"
												aria-label="Actions for {entry.label}"
												aria-expanded={openMenuPath === entry.path}
												aria-haspopup="menu"
											>
												<Ellipsis size={16} />
											</button>
											{#if openMenuPath === entry.path}
												<div
													role="menu"
													class="absolute top-full right-0 z-20 mt-1 min-w-[9rem] border border-gray-300 bg-white py-1 shadow-lg dark:border-gray-600 dark:bg-gray-800"
												>
													{#if canRenameEntry(entry)}
														<button
															type="button"
															role="menuitem"
															onclick={() => startRename(entry)}
															class="bx-text-secondary hover:bx-text-heading flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm transition-colors"
														>
															<Pencil size={14} />
															Rename
														</button>
													{/if}
													<button
														type="button"
														role="menuitem"
														onclick={() => beginDelete(entry)}
														class="bx-text-error flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-red-50 dark:hover:bg-red-950/30"
													>
														<Trash2 size={14} />
														Delete
													</button>
												</div>
											{/if}
										</div>
									{/if}
								</div>
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
								<FileText size={18} class="bx-text-muted shrink-0" />
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
								<span class="bx-text-muted shrink-0">.brix.yaml</span>
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
								<Folder size={18} class="bx-text-muted shrink-0" />
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
				<p class="bx-text-muted py-8 text-center text-sm">There's nothing here.</p>
			{/if}
		</div>
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
{/if}

{#if deleteTarget}
	{@const target = deleteTarget}
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
			aria-labelledby="delete-route-title"
			tabindex="-1"
			onkeydown={handleDeleteKeydown}
		>
			<h2 id="delete-route-title" class="bx-text-heading text-lg font-semibold">
				{target.kind === 'route' ? 'Delete directory' : 'Delete page'}
			</h2>
			<p class="bx-text-secondary mt-2 text-sm">
				{#if target.kind === 'route'}
					Delete “{target.label}” and everything inside it? This cannot be undone.
				{:else}
					Delete page “{target.label}”? This cannot be undone.
				{/if}
			</p>
			<div class="mt-6 flex gap-2">
				<form
					method="post"
					action="?/deleteRoute"
					class="flex-1"
					use:enhance={() => {
						deleting = true;
						return async ({ result, update }) => {
							deleting = false;
							if (result.type === 'success') {
								const wasRoute = target.kind === 'route';
								cancelDelete();
								showToast(wasRoute ? 'Directory deleted' : 'Page deleted');
							} else if (result.type === 'failure') {
								showToast(
									(result.data as { deleteError?: string })?.deleteError ?? 'Delete failed',
									'error'
								);
							}
							await update();
						};
					}}
				>
					<input type="hidden" name="kind" value={target.kind} />
					<input type="hidden" name="routeDirPath" value={target.routeDirPath} />
					{#if target.filePath}
						<input type="hidden" name="filePath" value={target.filePath} />
					{/if}
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

<MediaPicker
	open={mediaPickerOpen}
	branch={data.branch}
	mediaPath={data.repo.mediaPath}
	onselect={({ imageUrl }) => {
		if (builderImagePickCallback) {
			builderImagePickCallback(imageUrl);
			builderImagePickCallback = null;
			mediaPickerOpen = false;
		}
	}}
	onclose={() => {
		mediaPickerOpen = false;
		builderImagePickCallback = null;
	}}
/>

<IconPicker
	open={iconPickerOpen}
	branch={data.branch}
	onselect={async ({ downloadUrl }) => {
		const callback = builderIconPickCallback;
		if (callback) {
			iconPickerOpen = false;
			try {
				const res = await fetch(downloadUrl);
				if (!res.ok) throw new Error('Failed to fetch SVG');
				const svgText = await res.text();
				callback(svgText);
			} catch (err) {
				console.error('Failed to load icon SVG:', err);
			}
			if (builderIconPickCallback === callback) {
				builderIconPickCallback = null;
			}
		}
	}}
	onclose={() => {
		iconPickerOpen = false;
		builderIconPickCallback = null;
	}}
/>

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