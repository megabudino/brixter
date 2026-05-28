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
		serializeToMdsvex,
		type BuilderBlock,
		type BuilderRichTextValue
	} from '../core.js';
	import {
		attachPreviewContainer,
		resolvePreviewBinding,
		type PreviewCollectionOverlay,
		type PreviewOverlay
	} from '../preview-dom.js';
	import type {
		BuilderAppPreviewProps,
		BuilderRenderDefinition,
		PreviewRichTextEdit,
		PreviewTextEdit
	} from './contracts.js';
	import BuilderHierarchySidebar from './BuilderHierarchySidebar.svelte';
	import BuilderInspector from './BuilderInspector.svelte';
	import SveltePreviewRenderer from '../svelte/SveltePreviewRenderer.svelte';

	let { definitions }: { definitions: BuilderRenderDefinition[] } = $props();

	let controller = $state<ReturnType<typeof createEditorControllerState> | null>(null);
	let previewOverlays = $state<Record<string, PreviewOverlay[]>>({});
	let previewCollectionOverlays = $state<Record<string, PreviewCollectionOverlay[]>>({});
	let activeBlockId = $state<string | null>(null);
	let activeRichTextEdit = $state<PreviewRichTextEdit | null>(null);
	let activeTextEdit = $state<PreviewTextEdit | null>(null);
	let activePreviewEditElement: HTMLElement | null = null;

	$effect(() => {
		if (!controller) {
			controller = createEditorControllerState(definitions);
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

	const mdsvexOutput = $derived(serializeToMdsvex(controller?.document ?? { title: '', description: '', blocks: [] }, definitions));
	const activeReorderContext = $derived.by(() =>
		controller ? getActiveReorderContext(controller, definitions) : null
	);
	const activeBlock = $derived(
		controller?.document.blocks.find((block) => block.id === activeBlockId) ?? null
	);
	const activeDefinition = $derived(activeBlock ? getBuilderDefinition(activeBlock.type, definitions) : null);
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
		if (activeRichTextEdit?.blockId === blockId) {
			closeRichTextEdit();
		}
		if (activeTextEdit?.blockId === blockId) {
			closeTextEdit();
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
		handleBlockDrop(controller, targetBlockId);
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

	function selectBlock(blockId: string): void {
		activeBlockId = blockId;
	}

	function handlePreviewClick(block: BuilderBlock, event: Event): void {
		if (!controller) return;
		selectBlock(block.id);

		const definition = getBuilderDefinition(block.type, definitions);
		const container = event.currentTarget;

		if (!(container instanceof HTMLElement)) {
			return;
		}

		const resolvedBinding = resolvePreviewBinding(definition.previewBindings, container, event.target);
		if (!resolvedBinding) {
			return;
		}

		event.preventDefault();

		if (resolvedBinding.binding.type === 'image') {
			closePreviewInlineEdit();
			queueFileEdit(block.id, resolvedBinding.path);
			return;
		}

		if (resolvedBinding.binding.type === 'richtext') {
			const targetRect = resolvedBinding.matchedElement.getBoundingClientRect();
			const containerRect = container.getBoundingClientRect();
			const computed = window.getComputedStyle(resolvedBinding.matchedElement);
			const textStyle = [
				`font-family:${computed.fontFamily}`,
				`font-size:${computed.fontSize}`,
				`font-weight:${computed.fontWeight}`,
				`font-style:${computed.fontStyle}`,
				`line-height:${computed.lineHeight}`,
				`letter-spacing:${computed.letterSpacing}`,
				`text-transform:${computed.textTransform}`,
				`text-align:${computed.textAlign}`,
				`color:${computed.color}`
			].join(';');
			activeRichTextEdit = {
				blockId: block.id,
				path: resolvedBinding.path,
				selector: resolvedBinding.binding.selector,
				selectorIndex: getSelectorIndex(container, resolvedBinding.binding.selector, resolvedBinding.matchedElement),
				mode: resolvedBinding.binding.richTextMode ?? 'block',
				top: Math.max(8, targetRect.top - containerRect.top),
				left: Math.max(8, targetRect.left - containerRect.left),
				width: Math.max(80, targetRect.width),
				minHeight: Math.max(targetRect.height, 24),
				textStyle
			};
			activeTextEdit = null;
			hidePreviewEditElement(resolvedBinding.matchedElement);
			return;
		}

		if (resolvedBinding.binding.type === 'text') {
			const targetRect = resolvedBinding.matchedElement.getBoundingClientRect();
			const containerRect = container.getBoundingClientRect();
			const computed = window.getComputedStyle(resolvedBinding.matchedElement);
			const textStyle = createPreviewTextStyle(computed);
			const lineHeight = Number.parseFloat(computed.lineHeight);
			const multiline = targetRect.height > (Number.isFinite(lineHeight) ? lineHeight * 1.5 : 32);

			activeTextEdit = {
				blockId: block.id,
				path: resolvedBinding.path,
				selector: resolvedBinding.binding.selector,
				selectorIndex: getSelectorIndex(container, resolvedBinding.binding.selector, resolvedBinding.matchedElement),
				top: Math.max(8, targetRect.top - containerRect.top),
				left: Math.max(8, targetRect.left - containerRect.left),
				width: Math.max(80, targetRect.width),
				minHeight: Math.max(targetRect.height, 24),
				textStyle,
				multiline
			};
			activeRichTextEdit = null;
			hidePreviewEditElement(resolvedBinding.matchedElement);
		}
	}

	function handlePreviewKeydown(block: BuilderBlock, event: KeyboardEvent): void {
		if (event.key !== 'Enter' && event.key !== ' ') {
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

	function moveItem(block: BuilderBlock, collectionPath: string, index: number, direction: -1 | 1): void {
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

	function closeRichTextEdit(): void {
		activeRichTextEdit = null;
		restorePreviewEditElement();
	}

	function closeTextEdit(): void {
		activeTextEdit = null;
		restorePreviewEditElement();
	}

	function closePreviewInlineEdit(): void {
		activeRichTextEdit = null;
		activeTextEdit = null;
		restorePreviewEditElement();
	}

	function hidePreviewEditElement(element: Element): void {
		restorePreviewEditElement();

		if (element instanceof HTMLElement) {
			activePreviewEditElement = element;
			element.style.visibility = 'hidden';
		}
	}

	function restorePreviewEditElement(): void {
		if (activePreviewEditElement) {
			activePreviewEditElement.style.visibility = '';
			activePreviewEditElement = null;
		}
	}

	function updatePreviewRichText(block: BuilderBlock, path: string, value: BuilderRichTextValue): void {
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

	function createPreviewTextStyle(computed: CSSStyleDeclaration): string {
		return [
			`font-family:${computed.fontFamily}`,
			`font-size:${computed.fontSize}`,
			`font-weight:${computed.fontWeight}`,
			`font-style:${computed.fontStyle}`,
			`line-height:${computed.lineHeight}`,
			`letter-spacing:${computed.letterSpacing}`,
			`text-transform:${computed.textTransform}`,
			`text-align:${computed.textAlign}`,
			`color:${computed.color}`
		].join(';');
	}

	function getSelectorIndex(container: HTMLElement, selector: string, matchedElement: Element): number {
		return Math.max(0, Array.from(container.querySelectorAll(selector)).indexOf(matchedElement));
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
		params: { block: BuilderBlock; definition: BuilderRenderDefinition }
	): {
		update: (nextParams: { block: BuilderBlock; definition: BuilderRenderDefinition }) => void;
		destroy: () => void;
	} {
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
		const action = attachPreviewContainer(node, {
			...params,
			onOverlaysChange,
			onCollectionOverlaysChange
		});

		return {
			update(nextParams) {
				action.update({
					...nextParams,
					onOverlaysChange,
					onCollectionOverlaysChange
				});
			},
			destroy() {
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
		activeRichTextEdit,
		activeTextEdit,
		previewContainer,
		onPreviewClick: handlePreviewClick,
		onPreviewKeydown: handlePreviewKeydown,
		onSelectBlock: selectBlock,
		onCloseRichTextEdit: closeRichTextEdit,
		onCloseTextEdit: closeTextEdit,
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

<svelte:head>
	<title>Brixter Playground</title>
	<meta
		name="description"
		content="Playground di Brixter con editing visuale dei Brix ed export mdsvex opzionale." />
</svelte:head>

<div class="flex h-screen flex-col overflow-hidden bg-[#f0f0f0] text-[#1e1e1e]">
	<header class="flex h-[60px] shrink-0 items-center justify-between border-b border-[#ddd] bg-white px-3">
		<div class="flex items-center gap-2">
			<div class="flex h-9 w-9 items-center justify-center rounded-sm bg-[#1e1e1e] text-sm font-semibold text-white">
				B
			</div>
			<button
				type="button"
				class="flex h-9 w-9 items-center justify-center rounded-sm border border-[#1e1e1e] bg-[#1e1e1e] text-xl leading-none text-white"
				onclick={() => definitions[0] && addBlock(definitions[0].type)}
				aria-label="Aggiungi brik">
				+
			</button>
			<div class="ml-2 h-6 w-px bg-[#ddd]"></div>
			<p class="text-sm font-medium">Brixter Playground</p>
		</div>

		<div class="flex items-center gap-2">
			<span class="rounded-sm border border-[#ddd] px-2 py-1 text-xs text-[#757575]">Preview</span>
			<button
				type="button"
				class="rounded-sm bg-[#3858e9] px-3 py-1.5 text-xs font-medium text-white"
				onclick={copyMdsvex}>
				{controller?.copied ? 'Copiato' : 'Copia export'}
			</button>
		</div>
	</header>

	<div class="flex min-h-0 flex-1 overflow-hidden">
		<BuilderHierarchySidebar
			{definitions}
			blocks={controller?.document.blocks ?? []}
			{activeBlockId}
			onAddBlock={addBlock}
			onSelectBlock={selectBlock}
			onMoveBlock={moveBlock}
			onRemoveBlock={removeBlock}
			onDragStart={handleDragStart}
			onAllowDrop={allowDrop}
			onDrop={handleDrop} />

		<main class="min-w-0 flex-1 overflow-y-auto bg-white">
			<div class="min-h-full w-full">
				<div class="w-full bg-white">
					<SveltePreviewRenderer {...previewProps} />
				</div>
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
			onCopyMdsvex={copyMdsvex} />
	</div>
</div>

{#if activeReorderContext}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-6">
		<button
			type="button"
			class="absolute inset-0 bg-black/40"
			aria-label="Chiudi modale riordino"
			onclick={closeReorderModal}></button>
		<div
			class="relative w-full max-w-3xl rounded-3xl bg-white p-6 shadow-2xl"
			role="dialog"
			aria-modal="true"
			aria-label={`Riordina ${activeReorderContext.collection.label}`}
			tabindex="0">
			<div class="flex flex-wrap items-start justify-between gap-4">
				<div>
					<h2 class="text-xl font-semibold text-gray-900">
						Riordina {activeReorderContext.collection.label}
					</h2>
					<p class="mt-1 text-sm text-gray-500">
						Trascina gli elementi in una lista lineare per aggiornare l'ordine della collection.
					</p>
				</div>

				<button
					type="button"
					class="rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-900"
					onclick={closeReorderModal}>
					Chiudi
				</button>
			</div>

			<div class="mt-6 space-y-3" role="list">
				{#each activeReorderContext.items as item, itemIndex}
					<div
						class="flex cursor-move flex-wrap items-center justify-between gap-4 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3"
						role="listitem"
						draggable={true}
						ondragstart={() =>
							handleCollectionItemDragStart(
								activeReorderContext.block.id,
								activeReorderContext.collection.path,
								itemIndex
							)}
						ondragover={allowDrop}
						ondrop={() => handleCollectionItemDrop(itemIndex)}>
						<div class="flex min-w-0 items-center gap-4">
							<div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-xs font-semibold text-gray-500 ring-1 ring-gray-200">
								{itemIndex + 1}
							</div>

							<div class="min-w-0">
								<p class="truncate text-sm font-medium text-gray-900">
									{getCollectionItemSummary(item, activeReorderContext.collection, itemIndex)}
								</p>
								<p class="truncate text-xs text-gray-500">
									{activeReorderContext.collection.path}[{itemIndex}]
								</p>
							</div>
						</div>

						<div class="flex flex-wrap items-center gap-2 text-sm">
							<button
								type="button"
								class="rounded-full border border-gray-300 px-3 py-1.5"
								onclick={() =>
									moveItem(
										activeReorderContext.block,
										activeReorderContext.collection.path,
										itemIndex,
										-1
									)}>
								Su
							</button>
							<button
								type="button"
								class="rounded-full border border-gray-300 px-3 py-1.5"
								onclick={() =>
									moveItem(
										activeReorderContext.block,
										activeReorderContext.collection.path,
										itemIndex,
										1
									)}>
								Giu
							</button>
						</div>
					</div>
				{/each}
			</div>
		</div>
	</div>
{/if}
