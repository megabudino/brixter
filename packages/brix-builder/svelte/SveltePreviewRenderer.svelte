<script lang="ts">
	import { getBuilderDefinition } from '../editor-controller.js';
	import {
		createBuilderFallbackProps,
		normalizeBuilderPropsForRender
	} from '../core.js';
	import PreviewBlockInserter from '../editor/PreviewBlockInserter.svelte';
	import type { BuilderAppPreviewProps } from '../editor/contracts.js';
	import type { PreviewOverlay } from '../preview-dom.js';
	import type { BrikDefinition } from './adapter.js';

	let {
		definitions,
		blocks,
		propsErrors,
		previewOverlays,
		previewCollectionOverlays,
		activeBlockId,
		activeFieldEdit,
		previewContainer,
		onPreviewClick,
		onPreviewKeydown,
		onSelectBlock,
		onAddBlockBefore,
		onAddBlockAfter,
		onAddItem,
		onRemoveItem,
		onMoveItem,
		onOpenReorderModal,
		onOpenInserterModal
	}: BuilderAppPreviewProps & { definitions: BrikDefinition[] } = $props();

	let hoveredCollectionItem = $state<string | null>(null);
	let blockRenderSnapshots = $state<Record<string, Record<string, unknown>>>({});

	$effect(() => {
		const edit = activeFieldEdit;
		if (!edit) {
			blockRenderSnapshots = {};
			return;
		}

		if (blockRenderSnapshots[edit.blockId]) {
			return;
		}

		const block = blocks.find((entry) => entry.id === edit.blockId);
		if (!block) {
			return;
		}

		const definition = getBuilderDefinition(block.type, definitions);
		blockRenderSnapshots = {
			...blockRenderSnapshots,
			[edit.blockId]: normalizeBuilderPropsForRender(
				createBuilderFallbackProps(definition, block.props)
			) as Record<string, unknown>
		};
	});

	function getRenderProps(block: (typeof blocks)[number]): Record<string, unknown> {
		const definition = getBuilderDefinition(block.type, definitions);
		const liveProps = normalizeBuilderPropsForRender(
			createBuilderFallbackProps(definition, block.props)
		) as Record<string, unknown>;
		if (activeFieldEdit?.blockId === block.id && blockRenderSnapshots[block.id]) {
			return blockRenderSnapshots[block.id];
		}

		return liveProps;
	}

	function getCollectionItemKey(blockId: string, collectionPath: string, index: number): string {
		return `${blockId}:${collectionPath}:${index}`;
	}

	function updateHoveredCollectionItem(
		blockId: string,
		overlays: PreviewOverlay[],
		event: MouseEvent
	): void {
		if (
			isElement(event.target) &&
			event.target.closest('.collection-item-toolbar, .collection-item-add-button')
		) {
			return;
		}

		const container = event.currentTarget;
		if (!isHTMLElement(container)) {
			return;
		}

		const containerRect = container.getBoundingClientRect();
		const pointerX = event.clientX - containerRect.left;
		const pointerY = event.clientY - containerRect.top;

		const match = overlays.find((overlay) => {
			const top = Math.max(0, overlay.top + 36);
			const bottom = top + overlay.height;
			const left = overlay.left;
			const right = left + overlay.width;
			return pointerX >= left && pointerX <= right && pointerY >= top && pointerY <= bottom;
		});

		hoveredCollectionItem = match
			? getCollectionItemKey(blockId, match.collectionPath, match.index)
			: null;
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

	function getEditingContext(
		blockId: string,
		liveProps: Record<string, unknown>,
		hasPreviewBindings: boolean
	) {
		return {
			active:
				hasPreviewBindings && (activeBlockId === blockId || activeFieldEdit !== null),
			focusPath: activeFieldEdit?.blockId === blockId ? activeFieldEdit.path : null,
			caretOffset:
				activeFieldEdit?.blockId === blockId ? (activeFieldEdit.caretOffset ?? null) : null,
			previewProps: liveProps
		};
	}
</script>

<div>
	{#each blocks as block, blockIndex (block.id)}
		{@const definition = getBuilderDefinition(block.type, definitions)}
		{#if !propsErrors[block.id]}
			{@const BlockComponent = definition.component}
			{@const renderProps = getRenderProps(block)}
			{@const liveProps = normalizeBuilderPropsForRender(
				createBuilderFallbackProps(definition, block.props)
			) as Record<string, unknown>}
			{@const hasPreviewBindings = definition.previewBindings.length > 0}
			{#if hasPreviewBindings}
				<div
					data-builder-preview-block={block.id}
					use:previewContainer={{
						block,
						definition,
						editing: getEditingContext(block.id, liveProps, hasPreviewBindings)
					}}
					class={activeBlockId === block.id
						? 'group relative cursor-pointer scroll-mt-0.5 scroll-mb-0.5 transition'
						: 'group relative cursor-pointer scroll-mt-0.5 scroll-mb-0.5 transition'}
					role="button"
					tabindex="0"
					aria-label={`Modifica elementi del brik ${definition.type}`}
					onclick={(event: MouseEvent) => onPreviewClick(block, event)}
					onkeydown={(event: KeyboardEvent) => onPreviewKeydown(block, event)}
					onmousemove={(event: MouseEvent) =>
						updateHoveredCollectionItem(block.id, previewOverlays[block.id] ?? [], event)}
					onmouseleave={() => {
						hoveredCollectionItem = null;
					}}
				>
					<PreviewBlockInserter
						placement="before"
						lineVisible={activeBlockId !== block.id && blockIndex !== 0}
						edgeInset={blockIndex === 0}
						onToggle={() => onOpenInserterModal(block.id, 'before')}
					/>
					<div data-builder-preview-content>
						<BlockComponent {...renderProps} />
					</div>
					{#if activeBlockId === block.id}
						<div
							class="pointer-events-none absolute inset-px z-30 border-2 border-[#2563EB] dark:border-[#3B82F6]"
						></div>
					{/if}

					{#if definition.collections.length > 0}
						<div class="pointer-events-none absolute inset-0">
							{#each previewCollectionOverlays[block.id] ?? [] as overlay (overlay.collectionPath)}
								<div
									class="collection-overlay pointer-events-auto absolute z-10"
									style={`top:${overlay.top}px; left:${overlay.left}px; width:${overlay.width}px; height:${overlay.height}px;`}
								>
									<div
										class="collection-outline absolute inset-0 opacity-0 outline outline-1 outline-[#2563EB] transition outline-dashed dark:outline-[#3B82F6]"
									></div>
									<button
										type="button"
										class="collection-add-button pointer-events-auto absolute top-full left-1/2 flex h-7 w-7 -translate-x-1/2 translate-y-2 items-center justify-center border border-[#2563EB] bg-white text-lg leading-none text-[#2563EB] opacity-0 shadow-sm transition hover:bg-[#2563EB] hover:text-white dark:border-[#3B82F6] dark:bg-[#1f2937] dark:text-[#3B82F6] dark:hover:bg-[#3B82F6] dark:hover:text-white"
										aria-label={`Aggiungi ${overlay.label}`}
										onclick={(event) => {
											event.stopPropagation();
											onAddItem(block, overlay.collectionPath);
										}}
									>
										+
									</button>
								</div>
							{/each}

							{#each previewOverlays[block.id] ?? [] as overlay (`${overlay.collectionPath}-${overlay.index}`)}
								<div
									class="collection-item-overlay pointer-events-none absolute z-20"
									style={`top:${Math.max(0, overlay.top + 36)}px; left:${overlay.left}px; width:${overlay.width}px; height:${overlay.height}px;`}
								>
									<div
										class={hoveredCollectionItem ===
										getCollectionItemKey(block.id, overlay.collectionPath, overlay.index)
											? 'collection-item-outline absolute inset-0 opacity-100 outline outline-1 outline-[#2563EB] transition dark:outline-[#3B82F6]'
											: 'collection-item-outline absolute inset-0 opacity-0 outline outline-1 outline-[#2563EB] transition dark:outline-[#3B82F6]'}
									></div>
									<div
										class={hoveredCollectionItem ===
										getCollectionItemKey(block.id, overlay.collectionPath, overlay.index)
											? 'collection-item-toolbar pointer-events-auto absolute top-0 left-0 flex h-8 -translate-y-full items-center overflow-hidden border border-gray-300 bg-white text-xs text-gray-900 opacity-100 shadow-[0_2px_8px_rgba(0,0,0,0.18)] transition dark:border-gray-600 dark:bg-[#1f2937] dark:text-gray-100'
											: 'collection-item-toolbar pointer-events-auto absolute top-0 left-0 flex h-8 -translate-y-full items-center overflow-hidden border border-gray-300 bg-white text-xs text-gray-900 opacity-0 shadow-[0_2px_8px_rgba(0,0,0,0.18)] transition dark:border-gray-600 dark:bg-[#1f2937] dark:text-gray-100'}
									>
										<button
											type="button"
											class="h-full border-r border-gray-200 px-2.5 transition-colors hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-700"
											onclick={(event) => {
												event.stopPropagation();
												onMoveItem(block, overlay.collectionPath, overlay.index, -1);
											}}
										>
											↑
										</button>
										<button
											type="button"
											class="h-full border-r border-gray-200 px-2.5 transition-colors hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-700"
											onclick={(event) => {
												event.stopPropagation();
												onMoveItem(block, overlay.collectionPath, overlay.index, 1);
											}}
										>
											↓
										</button>
										<button
											type="button"
											class="h-full px-2.5 text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
											onclick={(event) => {
												event.stopPropagation();
												onRemoveItem(block, overlay.collectionPath, overlay.index);
											}}
										>
											×
										</button>
									</div>
								</div>
							{/each}
						</div>
					{/if}

					<PreviewBlockInserter
						placement="after"
						lineVisible={activeBlockId !== block.id && blockIndex !== blocks.length - 1}
						edgeInset={blockIndex === blocks.length - 1}
						onToggle={() => onOpenInserterModal(block.id, 'after')}
					/>
				</div>
			{:else}
				<div
					data-builder-preview-block={block.id}
					use:previewContainer={{
						block,
						definition,
						editing: getEditingContext(block.id, liveProps, hasPreviewBindings)
					}}
					class={activeBlockId === block.id
						? 'group relative scroll-mt-0.5 scroll-mb-0.5'
						: 'group relative scroll-mt-0.5 scroll-mb-0.5 transition'}
					role="button"
					tabindex="0"
					aria-label={`Seleziona brik ${definition.type}`}
					onclick={() => onSelectBlock(block.id)}
					onkeydown={(event: KeyboardEvent) => {
						if (event.key === 'Enter' || event.key === ' ') {
							event.preventDefault();
							onSelectBlock(block.id);
						}
					}}
					onmousemove={(event: MouseEvent) =>
						updateHoveredCollectionItem(block.id, previewOverlays[block.id] ?? [], event)}
					onmouseleave={() => {
						hoveredCollectionItem = null;
					}}
				>
					<PreviewBlockInserter
						placement="before"
						lineVisible={activeBlockId !== block.id && blockIndex !== 0}
						edgeInset={blockIndex === 0}
						onToggle={() => onOpenInserterModal(block.id, 'before')}
					/>
					<div data-builder-preview-content>
						<BlockComponent {...renderProps} />
					</div>
					{#if activeBlockId === block.id}
						<div
							class="pointer-events-none absolute inset-px z-30 border-2 border-[#2563EB] dark:border-[#3B82F6]"
						></div>
					{/if}

					{#if definition.collections.length > 0}
						<div class="pointer-events-none absolute inset-0">
							{#each previewCollectionOverlays[block.id] ?? [] as overlay (overlay.collectionPath)}
								<div
									class="collection-overlay pointer-events-auto absolute z-10"
									style={`top:${overlay.top}px; left:${overlay.left}px; width:${overlay.width}px; height:${overlay.height}px;`}
								>
									<div
										class="collection-outline absolute inset-0 opacity-0 outline outline-1 outline-[#2563EB] transition outline-dashed dark:outline-[#3B82F6]"
									></div>
									<button
										type="button"
										class="collection-add-button pointer-events-auto absolute top-full left-1/2 flex h-7 w-7 -translate-x-1/2 translate-y-2 items-center justify-center border border-[#2563EB] bg-white text-lg leading-none text-[#2563EB] opacity-0 shadow-sm transition hover:bg-[#2563EB] hover:text-white dark:border-[#3B82F6] dark:bg-[#1f2937] dark:text-[#3B82F6] dark:hover:bg-[#3B82F6] dark:hover:text-white"
										aria-label={`Aggiungi ${overlay.label}`}
										onclick={(event) => {
											event.stopPropagation();
											onAddItem(block, overlay.collectionPath);
										}}
									>
										+
									</button>
								</div>
							{/each}

							{#each previewOverlays[block.id] ?? [] as overlay (`${overlay.collectionPath}-${overlay.index}`)}
								<div
									class="collection-item-overlay pointer-events-none absolute z-20"
									style={`top:${Math.max(0, overlay.top + 36)}px; left:${overlay.left}px; width:${overlay.width}px; height:${overlay.height}px;`}
								>
									<div
										class={hoveredCollectionItem ===
										getCollectionItemKey(block.id, overlay.collectionPath, overlay.index)
											? 'collection-item-outline absolute inset-0 opacity-100 outline outline-1 outline-[#2563EB] transition dark:outline-[#3B82F6]'
											: 'collection-item-outline absolute inset-0 opacity-0 outline outline-1 outline-[#2563EB] transition dark:outline-[#3B82F6]'}
									></div>
									<div
										class={hoveredCollectionItem ===
										getCollectionItemKey(block.id, overlay.collectionPath, overlay.index)
											? 'collection-item-toolbar pointer-events-auto absolute top-0 left-0 flex h-8 -translate-y-full items-center overflow-hidden border border-gray-300 bg-white text-xs text-gray-900 opacity-100 shadow-[0_2px_8px_rgba(0,0,0,0.18)] transition dark:border-gray-600 dark:bg-[#1f2937] dark:text-gray-100'
											: 'collection-item-toolbar pointer-events-auto absolute top-0 left-0 flex h-8 -translate-y-full items-center overflow-hidden border border-gray-300 bg-white text-xs text-gray-900 opacity-0 shadow-[0_2px_8px_rgba(0,0,0,0.18)] transition dark:border-gray-600 dark:bg-[#1f2937] dark:text-gray-100'}
									>
										<button
											type="button"
											class="h-full border-r border-gray-200 px-2.5 transition-colors hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-700"
											onclick={(event) => {
												event.stopPropagation();
												onMoveItem(block, overlay.collectionPath, overlay.index, -1);
											}}
										>
											↑
										</button>
										<button
											type="button"
											class="h-full border-r border-gray-200 px-2.5 transition-colors hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-700"
											onclick={(event) => {
												event.stopPropagation();
												onMoveItem(block, overlay.collectionPath, overlay.index, 1);
											}}
										>
											↓
										</button>
										<button
											type="button"
											class="h-full px-2.5 text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
											onclick={(event) => {
												event.stopPropagation();
												onRemoveItem(block, overlay.collectionPath, overlay.index);
											}}
										>
											×
										</button>
									</div>
								</div>
							{/each}
						</div>
					{/if}

					<PreviewBlockInserter
						placement="after"
						lineVisible={activeBlockId !== block.id && blockIndex !== blocks.length - 1}
						edgeInset={blockIndex === blocks.length - 1}
						onToggle={() => onOpenInserterModal(block.id, 'after')}
					/>
				</div>
			{/if}
		{:else}
			<div
				class="border border-dashed border-red-300 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-800 dark:bg-red-950 dark:text-red-400"
			>
				Correggi i contenuti di questo brik per vedere di nuovo la preview.
			</div>
		{/if}
	{/each}
</div>

<style>
	.collection-overlay:hover .collection-outline,
	.collection-overlay:focus-within .collection-outline,
	.collection-overlay:hover .collection-add-button,
	.collection-overlay:focus-within .collection-add-button {
		opacity: 1;
	}
</style>
