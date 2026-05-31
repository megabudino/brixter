<script lang="ts">
	import {
		addBlock as addBlockToState,
		addItem as addItemToState,
		applyFileToPendingEdit,
		clearPendingFileEdit,
		closeReorderModal as closeReorderModalInState,
		createEditorControllerState,
		getActiveReorderContext,
		getBuilderDefinition,
		handleBlockDragStart,
		handleBlockDrop,
		handleCollectionItemDragStart as startCollectionItemDrag,
		handleCollectionItemDrop as dropCollectionItem,
		moveBlock as moveBlockInState,
		moveItem as moveItemInState,
		openReorderModal as openReorderModalInState,
		queueFileEdit as queueFileEditInState,
		removeBlock as removeBlockFromState,
		removeItem as removeItemFromState,
		setBlockError,
		updatePropAtPath
	} from '../editor-controller.js';
	import {
		createInspectorFieldsFromFields,
		getCollectionItemSummary,
		normalizeBuilderPropsForRender,
		parseBrixYamlDocument,
		serializeToBrixYaml,
		serializeToMdsvex,
		type BuilderBlock,
		type BuilderDocument,
		type BuilderPreviewBinding,
		type BuilderRichTextValue
	} from '../core.js';
	import { attachPreviewEditableFields } from '../preview/enhance-editable-fields.js';
	import {
		attachPreviewContainer,
		materializeFieldPath,
		resolvePreviewBinding,
		type PreviewCollectionOverlay,
		type PreviewOverlay
	} from '../preview-dom.js';
	import type {
		BuilderAppPreviewProps,
		BuilderRenderDefinition,
		PreviewFieldEdit
	} from './contracts.js';
	import BuilderInspector from './BuilderInspector.svelte';
	import BuilderPreviewFrame from './BuilderPreviewFrame.svelte';
	import PageFlowSidebar from './PageFlowSidebar.svelte';

	let {
		definitions,
		initialDocument,
		initialBrixYaml,
		chrome = 'standalone',
		onBrixYamlChange,
		pageFlowOpen = $bindable(true)
	}: {
		definitions: BuilderRenderDefinition[];
		initialDocument?: BuilderDocument;
		initialBrixYaml?: string;
		chrome?: 'standalone' | 'embedded';
		onBrixYamlChange?: (value: string) => void;
		pageFlowOpen?: boolean;
	} = $props();

	let controller = $state<ReturnType<typeof createEditorControllerState> | null>(null);
	let previewOverlays = $state<Record<string, PreviewOverlay[]>>({});
	let previewCollectionOverlays = $state<Record<string, PreviewCollectionOverlay[]>>({});
	let activeBlockId = $state<string | null>(null);
	let activeFieldEdit = $state<PreviewFieldEdit | null>(null);
	let pageFlowShortcutModifier = $state<'command' | 'control'>('command');
	const previewBlockElements = new Map<string, HTMLElement>();

	$effect(() => {
		if (!controller) {
			const hydratedDocument =
				initialDocument ??
				(initialBrixYaml ? parseBrixYamlDocument(initialBrixYaml, definitions) : undefined);
			controller = createEditorControllerState(definitions, hydratedDocument);
		}
	});

	$effect(() => {
		if (typeof navigator !== 'undefined') {
			pageFlowShortcutModifier = /Mac|iPhone|iPad|iPod/.test(navigator.platform)
				? 'command'
				: 'control';
		}
	});

	$effect(() => {
		const blocks = controller?.document.blocks ?? [];
		if (blocks.length === 0) {
			activeBlockId = null;
			return;
		}

		if (!activeBlockId || !blocks.some((block) => block.id === activeBlockId)) {
			activeBlockId = blocks[0]?.id ?? null;
		}
	});

	const mdsvexOutput = $derived(
		serializeToMdsvex(
			controller?.document ?? { title: '', description: '', blocks: [] },
			definitions
		)
	);
	const brixYamlOutput = $derived(
		serializeToBrixYaml(
			controller?.document ?? { title: '', description: '', blocks: [] },
			definitions
		)
	);
	const activeReorderContext = $derived.by(() =>
		controller ? getActiveReorderContext(controller, definitions) : null
	);
	const activeBlock = $derived(
		controller?.document.blocks.find((block) => block.id === activeBlockId) ?? null
	);
	const activeDefinition = $derived(
		activeBlock ? getBuilderDefinition(activeBlock.type, definitions) : null
	);
	const inspectorFields = $derived(
		activeDefinition ? createInspectorFieldsFromFields(activeDefinition.fields) : {}
	);

	function addBlock(type: string): void {
		if (!controller) return;
		const block = addBlockToState(controller, definitions, type);
		activeBlockId = block.id;
	}

	function addBlockAfter(blockId: string, type: string): void {
		if (!controller) return;

		const targetIndex = controller.document.blocks.findIndex((block) => block.id === blockId);
		const block = addBlockToState(controller, definitions, type);

		if (targetIndex !== -1) {
			controller.document.blocks = [
				...controller.document.blocks.slice(0, targetIndex + 1),
				block,
				...controller.document.blocks
					.slice(targetIndex + 1)
					.filter((entry) => entry.id !== block.id)
			];
		}

		activeBlockId = block.id;
	}

	function removeBlock(blockId: string): void {
		if (!controller) return;
		removeBlockFromState(controller, blockId);
		if (activeFieldEdit?.blockId === blockId) {
			closeFieldEdit();
		}
		if (activeBlockId === blockId) {
			activeBlockId = controller.document.blocks[0]?.id ?? null;
		}
	}

	function moveBlock(blockId: string, direction: -1 | 1): void {
		if (!controller) return;
		moveBlockInState(controller, blockId, direction);
	}

	function handleDragStart(blockId: string): void {
		if (!controller) return;
		handleBlockDragStart(controller, blockId);
	}

	function allowDrop(event: DragEvent): void {
		event.preventDefault();
	}

	function handleDrop(targetBlockId: string): void {
		if (!controller) return;
		const droppedBlockId = controller.draggedBlockId;
		handleBlockDrop(controller, targetBlockId);
		if (droppedBlockId) {
			selectBlock(droppedBlockId, { forceScroll: true });
		}
	}

	function togglePageFlow(): void {
		pageFlowOpen = !pageFlowOpen;
	}

	function handleWindowKeydown(event: KeyboardEvent): void {
		if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'b') {
			event.preventDefault();
			togglePageFlow();
		}
	}

	function updateFieldValue(block: BuilderBlock, path: string, value: unknown): void {
		if (!controller) return;
		updatePropAtPath(controller, block, path, value);
	}

	function queueFileEdit(blockId: string, path: string): void {
		if (!controller) return;
		queueFileEditInState(controller, blockId, path);
		openFilePicker();
	}

	function openFilePicker(): void {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = 'image/*';
		input.style.display = 'none';
		input.addEventListener('change', handleFileSelection, { once: true });
		document.body.append(input);
		input.click();
	}

	function scrollPreviewToBlock(blockId: string): void {
		const element = previewBlockElements.get(blockId);
		if (!element) return;

		requestAnimationFrame(() => {
			element.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
		});
	}

	function selectBlock(blockId: string, options: { forceScroll?: boolean } = {}): void {
		const selectionChanged = activeBlockId !== blockId;
		activeBlockId = blockId;
		if (selectionChanged || options.forceScroll) {
			scrollPreviewToBlock(blockId);
		}
	}

	function handlePreviewClick(block: BuilderBlock, event: Event): void {
		if (!controller) return;
		selectBlock(block.id);

		const definition = getBuilderDefinition(block.type, definitions);
		const container = event.currentTarget;

		if (!isHTMLElement(container)) {
			return;
		}

		const resolvedBinding = resolvePreviewBinding<BuilderPreviewBinding>({
			bindings: definition.previewBindings,
			container,
			target: event.target
		});
		if (!resolvedBinding) {
			closeFieldEdit();
			return;
		}

		event.preventDefault();

		if (resolvedBinding.binding.type === 'image') {
			closeFieldEdit();
			queueFileEdit(block.id, resolvedBinding.path);
			return;
		}

		if (resolvedBinding.binding.type === 'richtext' || resolvedBinding.binding.type === 'text') {
			const matchedElement = resolvedBinding.matchedElement as HTMLElement;
			const rawPath = matchedElement.getAttribute('data-builder-field');
			const path =
				rawPath != null
					? (materializeFieldPath(rawPath, container, matchedElement) ?? resolvedBinding.path)
					: resolvedBinding.path;

			activeFieldEdit = {
				blockId: block.id,
				path,
				caretOffset: getClickCaretOffset(matchedElement, event)
			};
		}
	}

	function handlePreviewKeydown(block: BuilderBlock, event: KeyboardEvent): void {
		if (event.key !== 'Enter' && event.key !== ' ') {
			return;
		}

		if (isEditableKeyboardTarget(event.target)) {
			return;
		}

		event.preventDefault();
		handlePreviewClick(block, event);
	}

	async function handleFileSelection(event: Event): Promise<void> {
		if (!controller) {
			return;
		}

		const target = event.currentTarget;
		const pending = controller.pendingFileEdit;
		if (!(target instanceof HTMLInputElement) || !pending) {
			return;
		}

		const [file] = Array.from(target.files ?? []);
		if (!file) {
			clearPendingFileEdit(controller);
			return;
		}

		try {
			const dataUrl = await readFileAsDataUrl(file);
			const updatedBlock = applyFileToPendingEdit(controller, dataUrl);
			if (!updatedBlock) {
				clearPendingFileEdit(controller);
			}
		} catch (error) {
			setBlockError(
				controller,
				pending.blockId,
				error instanceof Error ? error.message : 'Impossibile leggere il file selezionato.'
			);
			clearPendingFileEdit(controller);
		} finally {
			target.value = '';
			target.remove();
		}
	}

	function readFileAsDataUrl(file: File): Promise<string> {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => {
				if (typeof reader.result === 'string') {
					resolve(reader.result);
					return;
				}

				reject(new Error('Il file selezionato non puo essere convertito in data URL.'));
			};
			reader.onerror = () => reject(reader.error ?? new Error('Errore di lettura file.'));
			reader.readAsDataURL(file);
		});
	}

	function addItem(block: BuilderBlock, collectionPath: string): void {
		if (!controller) return;
		addItemToState(controller, definitions, block, collectionPath);
	}

	function removeItem(block: BuilderBlock, collectionPath: string, index: number): void {
		if (!controller) return;
		removeItemFromState(controller, definitions, block, collectionPath, index);
	}

	function moveItem(
		block: BuilderBlock,
		collectionPath: string,
		index: number,
		direction: -1 | 1
	): void {
		if (!controller) return;
		moveItemInState(controller, definitions, block, collectionPath, index, direction);
	}

	function openReorderModal(blockId: string, collectionPath: string): void {
		if (!controller) return;
		openReorderModalInState(controller, blockId, collectionPath);
	}

	function closeReorderModal(): void {
		if (!controller) return;
		closeReorderModalInState(controller);
	}

	function closeFieldEdit(): void {
		activeFieldEdit = null;
	}

	function updatePreviewRichText(
		block: BuilderBlock,
		path: string,
		value: BuilderRichTextValue
	): void {
		updateFieldValue(block, path, value);
	}

	function updatePreviewText(block: BuilderBlock, path: string, value: string): void {
		updateFieldValue(block, path, value);
	}

	function updateDocumentTitle(value: string): void {
		if (!controller) return;
		controller.document.title = value;
	}

	function updateDocumentDescription(value: string): void {
		if (!controller) return;
		controller.document.description = value;
	}

	$effect(() => {
		onBrixYamlChange?.(brixYamlOutput);
	});

	function getClickCaretOffset(element: Element, event: Event): number | null {
		if (!(event instanceof MouseEvent) || !isHTMLElement(element)) {
			return null;
		}

		const doc = element.ownerDocument;
		const range =
			doc.caretRangeFromPoint?.(event.clientX, event.clientY) ??
			(() => {
				const pos = doc.caretPositionFromPoint?.(event.clientX, event.clientY);
				if (!pos) {
					return null;
				}

				const nextRange = doc.createRange();
				nextRange.setStart(pos.offsetNode, pos.offset);
				nextRange.collapse(true);
				return nextRange;
			})();

		if (!range || !element.contains(range.startContainer)) {
			return null;
		}

		const preRange = doc.createRange();
		preRange.selectNodeContents(element);
		preRange.setEnd(range.startContainer, range.startOffset);
		return preRange.toString().length;
	}

	function isElement(value: unknown): value is Element {
		return typeof value === 'object' && value !== null && (value as Node).nodeType === 1;
	}

	function isHTMLElement(value: unknown): value is HTMLElement {
		if (!isElement(value)) {
			return false;
		}

		const view = value.ownerDocument.defaultView;
		return view ? value instanceof view.HTMLElement : value instanceof HTMLElement;
	}

	function isEditableKeyboardTarget(target: EventTarget | null): boolean {
		if (!isElement(target)) {
			return false;
		}

		return Boolean(
			target.closest(
				'.builder-preview-field-editor, .ProseMirror, .builder-preview-text-editor, input, textarea, [contenteditable="true"]'
			)
		);
	}

	function handleCollectionItemDragStart(
		blockId: string,
		collectionPath: string,
		index: number
	): void {
		if (!controller) return;
		startCollectionItemDrag(controller, blockId, collectionPath, index);
	}

	function handleCollectionItemDrop(targetIndex: number): void {
		if (!controller) return;
		dropCollectionItem(controller, definitions, targetIndex);
	}

	function previewContainer(
		node: HTMLElement,
		params: {
			block: BuilderBlock;
			definition: BuilderRenderDefinition;
			editing: import('./contracts.js').PreviewEditingContext;
		}
	): {
		update: (nextParams: {
			block: BuilderBlock;
			definition: BuilderRenderDefinition;
			editing: import('./contracts.js').PreviewEditingContext;
		}) => void;
		destroy: () => void;
	} {
		let blockId = params.block.id;
		previewBlockElements.set(blockId, node);

		const onOverlaysChange = (blockId: string, overlays: PreviewOverlay[]) => {
			if (overlays.length === 0) {
				delete previewOverlays[blockId];
				return;
			}

			previewOverlays[blockId] = overlays;
		};
		const onCollectionOverlaysChange = (blockId: string, overlays: PreviewCollectionOverlay[]) => {
			if (overlays.length === 0) {
				delete previewCollectionOverlays[blockId];
				return;
			}

			previewCollectionOverlays[blockId] = overlays;
		};
		const editableFields = attachPreviewEditableFields(node, {
			block: params.block,
			definition: params.definition,
			previewProps: params.editing.previewProps,
			active: params.editing.active,
			focusPath: params.editing.focusPath,
			caretOffset: params.editing.caretOffset,
			onUpdateRichText: (path, value) => updatePreviewRichText(params.block, path, value),
			onUpdateText: (path, value) => updatePreviewText(params.block, path, value),
			onQueueFileEdit: (path) => queueFileEdit(params.block.id, path),
			onCloseFieldEdit: closeFieldEdit,
			onFocusField: (path, caretOffset) => {
				activeFieldEdit = { blockId: params.block.id, path, caretOffset };
				selectBlock(params.block.id, { forceScroll: false });
			}
		});
		const action = attachPreviewContainer(node, {
			block: params.block,
			definition: params.definition,
			onOverlaysChange,
			onCollectionOverlaysChange
		});

		return {
			update(nextParams) {
				if (blockId !== nextParams.block.id) {
					previewBlockElements.delete(blockId);
					blockId = nextParams.block.id;
					previewBlockElements.set(blockId, node);
				}

				editableFields.update({
					block: nextParams.block,
					definition: nextParams.definition,
					previewProps: nextParams.editing.previewProps,
					active: nextParams.editing.active,
					focusPath: nextParams.editing.focusPath,
					caretOffset: nextParams.editing.caretOffset,
					onUpdateRichText: (path, value) => updatePreviewRichText(nextParams.block, path, value),
					onUpdateText: (path, value) => updatePreviewText(nextParams.block, path, value),
					onQueueFileEdit: (path) => queueFileEdit(nextParams.block.id, path),
					onCloseFieldEdit: closeFieldEdit,
					onFocusField: (path, caretOffset) => {
						activeFieldEdit = { blockId: nextParams.block.id, path, caretOffset };
						selectBlock(nextParams.block.id, { forceScroll: false });
					}
				});
				action.update({
					block: nextParams.block,
					definition: nextParams.definition,
					onOverlaysChange,
					onCollectionOverlaysChange
				});
			},
			destroy() {
				previewBlockElements.delete(blockId);
				editableFields.destroy();
				action.destroy();
			}
		};
	}

	async function copyMdsvex(): Promise<void> {
		if (!controller) return;
		await navigator.clipboard.writeText(mdsvexOutput);
		controller.copied = true;
		setTimeout(() => {
			if (controller) {
				controller.copied = false;
			}
		}, 1500);
	}

	const previewProps = $derived<BuilderAppPreviewProps>({
		definitions,
		blocks: controller?.document.blocks ?? [],
		propsErrors: controller?.propsErrors ?? {},
		previewOverlays,
		previewCollectionOverlays,
		activeBlockId,
		activeFieldEdit,
		previewContainer,
		onPreviewClick: handlePreviewClick,
		onPreviewKeydown: handlePreviewKeydown,
		onSelectBlock: selectBlock,
		onCloseFieldEdit: closeFieldEdit,
		onUpdateRichText: updatePreviewRichText,
		onUpdateText: updatePreviewText,
		onQueueFileEdit: queueFileEdit,
		onAddBlockAfter: addBlockAfter,
		onAddItem: addItem,
		onRemoveItem: removeItem,
		onMoveItem: moveItem,
		onOpenReorderModal: openReorderModal
	});
</script>

<svelte:window onkeydown={handleWindowKeydown} />

<svelte:head>
	<title>Brixter Builder</title>
	<meta
		name="description"
		content="Brixter visual editor for briks, pages, and optional mdsvex export."
	/>
</svelte:head>

<div
	class={chrome === 'standalone'
		? 'flex h-screen flex-col overflow-hidden bg-gray-50 text-gray-900 dark:bg-gray-900 dark:text-gray-100'
		: 'flex h-full min-h-0 flex-col overflow-hidden bg-gray-50 text-gray-900 dark:bg-gray-900 dark:text-gray-100'}
>
	{#if chrome === 'standalone'}
		<header
			class="flex h-[60px] shrink-0 items-center justify-between border-b border-gray-200 bg-white px-3 dark:border-gray-700 dark:bg-[#111827]"
		>
			<div class="flex items-center gap-2">
				<div
					class="flex h-9 w-9 items-center justify-center bg-gray-900 text-sm font-semibold text-white dark:bg-gray-100 dark:text-gray-900"
				>
					B
				</div>
				<button
					type="button"
					class={pageFlowOpen
					? 'group relative flex h-9 w-9 items-center justify-center border border-[#2563EB] bg-[#2563EB] text-white transition-colors hover:border-[#3B82F6] hover:bg-[#3B82F6] dark:border-[#3B82F6] dark:bg-[#3B82F6] dark:text-white dark:hover:border-[#2563EB] dark:hover:bg-[#2563EB]'
					: 'group relative flex h-9 w-9 items-center justify-center border border-gray-300 bg-white text-gray-900 transition-colors hover:border-[#2563EB] hover:bg-[#2563EB] hover:text-white dark:border-gray-600 dark:bg-[#1f2937] dark:text-gray-100 dark:hover:border-[#3B82F6] dark:hover:bg-[#3B82F6] dark:hover:text-white'}
					aria-label={pageFlowOpen ? 'Chiudi Page flow' : 'Apri Page flow'}
					aria-pressed={pageFlowOpen}
					onclick={togglePageFlow}
				>
					<svg class="h-4 w-4" viewBox="0 0 16 16" aria-hidden="true">
						<path
							d="M3 3.5h10v1.25H3V3.5Zm0 3.875h10v1.25H3v-1.25Zm0 3.875h10v1.25H3v-1.25Z"
							fill="currentColor"
						/>
					</svg>
					<span
						class="pointer-events-none absolute top-full left-0 z-50 mt-2 flex flex-col items-start gap-1.5 border border-gray-200 bg-white px-3 py-2 text-xs whitespace-nowrap text-gray-900 opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
					>
						<span class="font-semibold">Page flow</span>
						<span class="flex items-center gap-1 text-gray-500 dark:text-gray-400">
							<span
								class="inline-flex h-5 items-center gap-1 border border-gray-300 bg-gray-50 px-1.5 text-[11px] font-medium text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
							>
								{#if pageFlowShortcutModifier === 'command'}
									<svg class="h-3 w-3" viewBox="0 0 16 16" aria-hidden="true">
										<path
											d="M5 2.25A2.75 2.75 0 0 0 2.25 5v.75H5V2.25Zm1.25 3.5h3.5v-3.5h-3.5v3.5Zm4.75 0h2.75V5A2.75 2.75 0 0 0 11 2.25h-.75v3.5ZM9.75 7h-3.5v2h3.5V7ZM5 7H2.25v2H5V7Zm5.25 0v2h3.5V7h-3.5ZM5 10.25H2.25V11A2.75 2.75 0 0 0 5 13.75h.75v-3.5H5Zm1.25 0v3.5h3.5v-3.5h-3.5Zm4 0v3.5H11A2.75 2.75 0 0 0 13.75 11v-.75h-3.5Z"
											fill="currentColor"
										/>
									</svg>
								{:else}
									Ctrl
								{/if}
							</span>
							<span class="text-[11px] font-semibold text-gray-400 dark:text-gray-500">+</span>
							<span
								class="inline-flex h-5 items-center border border-gray-300 bg-gray-50 px-1.5 text-[11px] font-medium text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
							>
								B
							</span>
						</span>
					</span>
				</button>
				<button
					type="button"
					class="flex h-9 w-9 items-center justify-center bg-[#2563EB] text-xl leading-none text-white transition-colors hover:bg-[#3B82F6]"
					onclick={() => definitions[0] && addBlock(definitions[0].type)}
					aria-label="Aggiungi brik"
				>
					+
				</button>
				<div class="ml-2 h-6 w-px bg-gray-200 dark:bg-gray-700"></div>
				<p class="text-sm font-medium">Brixter Builder</p>
			</div>

			<div class="flex items-center gap-2">
				<span class="text-muted border border-gray-200 px-2 py-1 text-xs dark:border-gray-700"
					>Preview</span
				>
				<button
					type="button"
					class="bg-[#2563EB] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#3B82F6]"
					onclick={copyMdsvex}
				>
					{controller?.copied ? 'Copiato' : 'Copia export'}
				</button>
			</div>
		</header>
	{/if}

	<div class="flex min-h-0 flex-1 overflow-hidden">
		{#if pageFlowOpen}
			<PageFlowSidebar
				blocks={controller?.document.blocks ?? []}
				{activeBlockId}
				onSelectBlock={selectBlock}
				onMoveBlock={moveBlock}
				onRemoveBlock={removeBlock}
				onDragStart={handleDragStart}
				onAllowDrop={allowDrop}
				onDrop={handleDrop}
			/>
		{/if}

		<main class="min-w-0 flex-1 overflow-hidden bg-white dark:bg-[#0f1623]">
			<div class="h-full min-h-0 w-full">
				<BuilderPreviewFrame {...previewProps} onKeydown={handleWindowKeydown} />
			</div>
		</main>

		<BuilderInspector
			title={controller?.document.title ?? ''}
			description={controller?.document.description ?? ''}
			{activeBlock}
			{activeDefinition}
			{inspectorFields}
			propsError={activeBlock ? (controller?.propsErrors[activeBlock.id] ?? null) : null}
			{mdsvexOutput}
			copied={controller?.copied ?? false}
			onTitleChange={updateDocumentTitle}
			onDescriptionChange={updateDocumentDescription}
			onFieldChange={updateFieldValue}
			onQueueFileEdit={queueFileEdit}
			onAddItem={addItem}
			onRemoveItem={removeItem}
			onMoveItem={moveItem}
			onCopyMdsvex={copyMdsvex}
		/>
	</div>
</div>

{#if activeReorderContext}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-6">
		<button
			type="button"
			class="absolute inset-0 bg-black/40"
			aria-label="Chiudi modale riordino"
			onclick={closeReorderModal}
		></button>
		<div
			class="relative w-full max-w-3xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-700 dark:bg-[#111827]"
			role="dialog"
			aria-modal="true"
			aria-label={`Riordina ${activeReorderContext.collection.label}`}
			tabindex="0"
		>
			<div class="flex flex-wrap items-start justify-between gap-4">
				<div>
					<h2 class="font-display text-heading text-2xl">
						Riordina {activeReorderContext.collection.label}
					</h2>
					<p class="text-muted mt-1 text-sm">
						Trascina gli elementi in una lista lineare per aggiornare l'ordine della collection.
					</p>
				</div>

				<button
					type="button"
					class="border border-gray-300 px-4 py-2 text-sm font-medium text-gray-900 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:text-gray-100 dark:hover:bg-gray-700"
					onclick={closeReorderModal}
				>
					Chiudi
				</button>
			</div>

			<div class="mt-6 space-y-3" role="list">
				{#each activeReorderContext.items as item, itemIndex}
					<div
						class="flex cursor-move flex-wrap items-center justify-between gap-4 border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-[#1f2937]"
						role="listitem"
						draggable={true}
						ondragstart={() =>
							handleCollectionItemDragStart(
								activeReorderContext.block.id,
								activeReorderContext.collection.path,
								itemIndex
							)}
						ondragover={allowDrop}
						ondrop={() => handleCollectionItemDrop(itemIndex)}
					>
						<div class="flex min-w-0 items-center gap-4">
							<div
								class="text-muted flex h-12 w-12 items-center justify-center border border-gray-200 bg-white text-xs font-semibold dark:border-gray-700 dark:bg-[#111827]"
							>
								{itemIndex + 1}
							</div>

							<div class="min-w-0">
								<p class="text-heading truncate text-sm font-medium">
									{getCollectionItemSummary(item, activeReorderContext.collection, itemIndex)}
								</p>
								<p class="text-muted truncate text-xs">
									{activeReorderContext.collection.path}[{itemIndex}]
								</p>
							</div>
						</div>

						<div class="flex flex-wrap items-center gap-2 text-sm">
							<button
								type="button"
								class="border border-gray-300 px-3 py-1.5 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-700"
								onclick={() =>
									moveItem(
										activeReorderContext.block,
										activeReorderContext.collection.path,
										itemIndex,
										-1
									)}
							>
								Su
							</button>
							<button
								type="button"
								class="border border-gray-300 px-3 py-1.5 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-700"
								onclick={() =>
									moveItem(
										activeReorderContext.block,
										activeReorderContext.collection.path,
										itemIndex,
										1
									)}
							>
								Giu
							</button>
						</div>
					</div>
				{/each}
			</div>
		</div>
	</div>
{/if}
