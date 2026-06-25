<script lang="ts">
	import { untrack } from 'svelte';
	import { getBuilderDefinition } from '../editor-controller.js';
	import {
		createBuilderFallbackProps,
		normalizeBuilderPropsForRender,
		resolveImagePropsForRender,
		getFieldByPath,
		inferBuilderFieldKind
	} from '../core.js';
	import PreviewBlockInserter from '../editor/PreviewBlockInserter.svelte';
	import { attachPreviewInteractionGuard } from '../preview/block-preview-interactions.js';
	import type { BuilderAppPreviewProps } from '../editor/contracts.js';
	import type { PreviewOverlay, PreviewCollectionOverlay } from '../preview-dom.js';
	import type { BrikDefinition } from './adapter.js';

	let {
		definitions,
		blocks,
		propsErrors,
		previewOverlays,
		previewCollectionOverlays,
		activeBlockId,
		activeFieldEdit,
		activeCollectionItem,
		previewContainer,
		onPreviewClick,
		onPreviewKeydown,
		onSelectBlock,
		onDeselectBlock,
		onAddItem,
		onRemoveItem,
		onMoveItem,
		onOpenReorderModal,
		onOpenInserter,
		resolveImageSrc,
		previewMode = false
	}: BuilderAppPreviewProps & { definitions: BrikDefinition[] } = $props();

	let hoveredCollectionItem = $state<string | null>(null);
	let hoveredCollection = $state<string | null>(null);

	let blockRenderSnapshotsCache: Record<string, Record<string, unknown>> = {};
	let lastActiveBlockId: string | null = null;
	let lastActivePath: string | null = null;

	const blockRenderSnapshots = $derived.by(() => {
		const edit = activeFieldEdit;
		if (!edit) {
			blockRenderSnapshotsCache = {};
			lastActiveBlockId = null;
			lastActivePath = null;
			return {} as Record<string, Record<string, unknown>>;
		}

		if (lastActiveBlockId === edit.blockId && lastActivePath === edit.path) {
			return blockRenderSnapshotsCache;
		}

		const block = blocks.find((entry) => entry.id === edit.blockId);
		if (!block) {
			return {} as Record<string, Record<string, unknown>>;
		}

		const definition = getBuilderDefinition(block.type, definitions);
		const field = getFieldByPath(definition.fields, edit.path);
		const kind = field ? inferBuilderFieldKind(field) : null;

		if (kind === 'image' || kind === 'icon') {
			blockRenderSnapshotsCache = {};
			lastActiveBlockId = edit.blockId;
			lastActivePath = edit.path;
			return {} as Record<string, Record<string, unknown>>;
		}

		lastActiveBlockId = edit.blockId;
		lastActivePath = edit.path;
		blockRenderSnapshotsCache = untrack(() => {
			return {
				[edit.blockId]: normalizeBuilderPropsForRender(
					createBuilderFallbackProps(definition, block.props, { contentFallback: false })
				) as Record<string, unknown>
			};
		});

		return blockRenderSnapshotsCache;
	});

	function resolveImages(
		props: Record<string, unknown>,
		definition: BrikDefinition
	): Record<string, unknown> {
		if (!resolveImageSrc) {
			return props;
		}
		return resolveImagePropsForRender(props, definition.fields, resolveImageSrc);
	}

	function getRenderProps(block: (typeof blocks)[number]): Record<string, unknown> {
		const definition = getBuilderDefinition(block.type, definitions);
		if (previewMode) {
			return resolveImages(
				normalizeBuilderPropsForRender(block.props) as Record<string, unknown>,
				definition
			);
		}

		const liveProps = normalizeBuilderPropsForRender(
			createBuilderFallbackProps(definition, block.props, { contentFallback: false })
		) as Record<string, unknown>;
		if (activeFieldEdit?.blockId === block.id && blockRenderSnapshots[block.id]) {
			return resolveImages(blockRenderSnapshots[block.id], definition);
		}

		return resolveImages(liveProps, definition);
	}

	function getCollectionItemKey(blockId: string, collectionPath: string, index: number): string {
		return `${blockId}:${collectionPath}:${index}`;
	}

	function updateHoverStates(
		blockId: string,
		itemOverlays: PreviewOverlay[],
		collectionOverlays: PreviewCollectionOverlay[],
		event: MouseEvent
	): void {
		if (
			isElement(event.target) &&
			event.target.closest('.collection-item-toolbar, .collection-add-button')
		) {
			return;
		}

		const container = event.currentTarget || (isElement(event.target) ? event.target.closest('[data-brixter-preview-block]') : null);
		if (!isHTMLElement(container)) {
			return;
		}

		// 1. Try DOM target matching first (100% accurate, no coordinate issues)
		if (isElement(event.target)) {
			const itemElement = event.target.closest('[data-brixter-collection-item]');
			if (itemElement) {
				const collectionPath = itemElement.getAttribute('data-brixter-collection-item');
				if (collectionPath) {
					const items = Array.from(container.querySelectorAll(`[data-brixter-collection-item="${collectionPath}"]`));
					const index = items.indexOf(itemElement);
					if (index !== -1) {
						hoveredCollectionItem = getCollectionItemKey(blockId, collectionPath, index);
						hoveredCollection = `${blockId}:${collectionPath}`;
						return;
					}
				}
			}
		}

		// 2. Coordinate fallback (in case mouse is over padding or empty space of collection)
		const containerRect = container.getBoundingClientRect();
		const pointerX = event.clientX - containerRect.left;
		const pointerY = event.clientY - containerRect.top;

		const itemMatch = itemOverlays.find((overlay) => {
			const top = Math.max(0, overlay.top + 36);
			const bottom = top + overlay.height;
			const left = overlay.left;
			const right = left + overlay.width;
			return pointerX >= left && pointerX <= right && pointerY >= top && pointerY <= bottom;
		});

		hoveredCollectionItem = itemMatch
			? getCollectionItemKey(blockId, itemMatch.collectionPath, itemMatch.index)
			: null;

		const collectionMatch = collectionOverlays.find((overlay) => {
			const top = overlay.top;
			const bottom = top + overlay.height + 45;
			const left = overlay.left;
			const right = left + overlay.width;
			return pointerX >= left && pointerX <= right && pointerY >= top && pointerY <= bottom;
		});

		hoveredCollection = collectionMatch
			? `${blockId}:${collectionMatch.collectionPath}`
			: null;
	}

	function isElement(value: unknown): value is Element {
		return typeof value === 'object' && value !== null && (value as Node).nodeType === 1;
	}

	function isHTMLElement(value: unknown): value is HTMLElement {
		return isElement(value);
	}

	function getEditingContext(
		blockId: string,
		rawProps: Record<string, unknown>,
		hasPreviewBindings: boolean
	) {
		return {
			active: previewMode ? false : hasPreviewBindings,
			focusPath: activeFieldEdit?.blockId === blockId ? activeFieldEdit.path : null,
			caretOffset:
				activeFieldEdit?.blockId === blockId ? (activeFieldEdit.caretOffset ?? null) : null,
			previewProps: rawProps
		};
	}

	let rootElement = $state<HTMLElement | undefined>();

	$effect(() => {
		// Attach to the document that actually hosts the rendered preview (the
		// builder iframe), not the ambient global `document` of the parent realm.
		const previewDocument = rootElement?.ownerDocument;
		if (!previewDocument) {
			return;
		}

		return attachPreviewInteractionGuard(previewDocument);
	});
</script>

<div bind:this={rootElement} onclick={(event) => {
	if (!(event.target as Element).closest('[data-brixter-preview-block]')) {
		onDeselectBlock();
	}
}}>
	{#if blocks.length == 0}
		{#if !previewMode}
			<div class="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-12 text-center">
				<div class="space-y-1">
					<p class="bx-text-heading text-lg font-semibold">Your page is empty</p>
					<p class="bx-text-muted text-sm">Add your first brik to start building.</p>
				</div>
				<button
					type="button"
					class="bx-btn-brutal flex items-center gap-2 px-4 py-2 text-sm font-medium"
					onclick={() => onOpenInserter(0)}
				>
					<span class="text-lg leading-none">+</span>
					Add the first brik
				</button>
			</div>
		{/if}
	{:else}
		{#each blocks as block, blockIndex (block.id)}
			{@const definition = getBuilderDefinition(block.type, definitions)}
			{#if !propsErrors[block.id]}
				{@const BlockComponent = definition.component}
				{@const renderProps = getRenderProps(block)}
				{@const liveProps = normalizeBuilderPropsForRender(
					createBuilderFallbackProps(definition, block.props, { contentFallback: false })
				) as Record<string, unknown>}
				{@const hasPreviewBindings = definition.previewBindings.length > 0}
				{#if hasPreviewBindings}
					<div
						data-brixter-preview-block={block.id}
						use:previewContainer={{
							block,
							definition,
							editing: getEditingContext(block.id, block.props, hasPreviewBindings)
						}}
						class="group relative scroll-mt-0.5 scroll-mb-0.5 transition"
						class:cursor-pointer={!previewMode}
						role={previewMode ? undefined : "button"}
						tabindex={previewMode ? undefined : 0}
						aria-label={previewMode ? undefined : `Modifica elementi del brik ${definition.type}`}
						onclick={previewMode ? undefined : (event: MouseEvent) => onPreviewClick(block, event)}
						onkeydown={previewMode ? undefined : (event: KeyboardEvent) => onPreviewKeydown(block, event)}
						onmousemove={previewMode ? undefined : (event: MouseEvent) =>
							updateHoverStates(
								block.id,
								previewOverlays[block.id] ?? [],
								previewCollectionOverlays[block.id] ?? [],
								event
							)}
						onmouseleave={previewMode ? undefined : () => {
							hoveredCollectionItem = null;
							hoveredCollection = null;
						}}
					>
						{#if !previewMode}
							<PreviewBlockInserter
								placement="before"
								edgeInset={blockIndex === 0}
								onToggle={() => onOpenInserter(blockIndex)}
							/>
						{/if}
						<div data-brixter-preview-content>
							<BlockComponent {...renderProps} />
						</div>
						{#if activeBlockId === block.id && !previewMode}
							<div
								class="pointer-events-none absolute inset-px z-30 border-2 border-[#FDE047] dark:border-[#FACC15]"
							></div>
						{/if}

						{#if definition.collections.length > 0 && !previewMode}
							<div class="pointer-events-none absolute inset-0">
								{#each previewCollectionOverlays[block.id] ?? [] as overlay (overlay.collectionPath)}
									<div
										class="collection-overlay pointer-events-none absolute z-10"
										style={`top:${overlay.top}px; left:${overlay.left}px; width:${overlay.width}px; height:${overlay.height}px;`}
									>
										<div
											class="collection-outline absolute inset-0 outline outline-1 outline-[#FDE047] transition outline-dashed dark:outline-[#FACC15] {hoveredCollection === `${block.id}:${overlay.collectionPath}` ? 'opacity-100' : 'opacity-0'}"
										></div>
										<button
											type="button"
											class="collection-add-button bx-btn-brutal-icon absolute top-full left-1/2 flex h-7 w-7 -translate-x-1/2 translate-y-2 items-center justify-center text-lg leading-none transition {hoveredCollection === `${block.id}:${overlay.collectionPath}` ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}"
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
									{@const isSelectedItem =
										activeCollectionItem?.blockId === block.id &&
										activeCollectionItem?.collectionPath === overlay.collectionPath &&
										activeCollectionItem?.index === overlay.index}
									<div
										class="collection-item-overlay pointer-events-none absolute z-20"
										style={`top:${Math.max(0, overlay.top + 36)}px; left:${overlay.left}px; width:${overlay.width}px; height:${overlay.height}px;`}
									>
										<div
											class={hoveredCollectionItem ===
												getCollectionItemKey(block.id, overlay.collectionPath, overlay.index) ||
											isSelectedItem
												? `collection-item-outline absolute inset-0 opacity-100 outline outline-1 outline-[#FDE047] transition dark:outline-[#FACC15] ${isSelectedItem ? 'outline-2' : ''}`
												: 'collection-item-outline absolute inset-0 opacity-0 outline outline-1 outline-[#FDE047] transition dark:outline-[#FACC15]'}
										></div>
										<div
											class={hoveredCollectionItem ===
											getCollectionItemKey(block.id, overlay.collectionPath, overlay.index)
												? 'collection-item-toolbar pointer-events-auto absolute top-0 left-0 flex h-8 -translate-y-full items-center overflow-hidden border border-gray-300 bg-white text-xs text-gray-900 opacity-100 shadow-[0_2px_8px_rgba(0,0,0,0.18)] transition dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100'
												: 'collection-item-toolbar pointer-events-none absolute top-0 left-0 flex h-8 -translate-y-full items-center overflow-hidden border border-gray-300 bg-white text-xs text-gray-900 opacity-0 shadow-[0_2px_8px_rgba(0,0,0,0.18)] transition dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100'}
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

						{#if !previewMode}
							<PreviewBlockInserter
								placement="after"
								edgeInset={blockIndex === blocks.length - 1}
								onToggle={() => onOpenInserter(blockIndex + 1)}
							/>
						{/if}
					</div>
				{:else}
					<div
						data-brixter-preview-block={block.id}
						use:previewContainer={{
							block,
							definition,
							editing: getEditingContext(block.id, block.props, hasPreviewBindings)
						}}
						class="group relative scroll-mt-0.5 scroll-mb-0.5 transition"
						class:cursor-pointer={!previewMode}
						role={previewMode ? undefined : "button"}
						tabindex={previewMode ? undefined : 0}
						aria-label={previewMode ? undefined : `Seleziona brik ${definition.type}`}
						onclick={previewMode ? undefined : (event: MouseEvent) => onPreviewClick(block, event)}
						onkeydown={previewMode ? undefined : (event: KeyboardEvent) => onPreviewKeydown(block, event)}
						onmousemove={previewMode ? undefined : (event: MouseEvent) =>
							updateHoverStates(
								block.id,
								previewOverlays[block.id] ?? [],
								previewCollectionOverlays[block.id] ?? [],
								event
							)}
						onmouseleave={previewMode ? undefined : () => {
							hoveredCollectionItem = null;
							hoveredCollection = null;
						}}
					>
						{#if !previewMode}
							<PreviewBlockInserter
								placement="before"
								edgeInset={blockIndex === 0}
								onToggle={() => onOpenInserter(blockIndex)}
							/>
						{/if}
						<div data-brixter-preview-content>
							<BlockComponent {...renderProps} />
						</div>
						{#if activeBlockId === block.id && !previewMode}
							<div
								class="pointer-events-none absolute inset-px z-30 border-2 border-[#FDE047] dark:border-[#FACC15]"
							></div>
						{/if}

						{#if definition.collections.length > 0 && !previewMode}
							<div class="pointer-events-none absolute inset-0">
								{#each previewCollectionOverlays[block.id] ?? [] as overlay (overlay.collectionPath)}
									<div
										class="collection-overlay pointer-events-none absolute z-10"
										style={`top:${overlay.top}px; left:${overlay.left}px; width:${overlay.width}px; height:${overlay.height}px;`}
									>
										<div
											class="collection-outline absolute inset-0 outline outline-1 outline-[#FDE047] transition outline-dashed dark:outline-[#FACC15] {hoveredCollection === `${block.id}:${overlay.collectionPath}` ? 'opacity-100' : 'opacity-0'}"
										></div>
										<button
											type="button"
											class="collection-add-button bx-btn-brutal-icon absolute top-full left-1/2 flex h-7 w-7 -translate-x-1/2 translate-y-2 items-center justify-center text-lg leading-none transition {hoveredCollection === `${block.id}:${overlay.collectionPath}` ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}"
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
									{@const isSelectedItem =
										activeCollectionItem?.blockId === block.id &&
										activeCollectionItem?.collectionPath === overlay.collectionPath &&
										activeCollectionItem?.index === overlay.index}
									<div
										class="collection-item-overlay pointer-events-none absolute z-20"
										style={`top:${Math.max(0, overlay.top + 36)}px; left:${overlay.left}px; width:${overlay.width}px; height:${overlay.height}px;`}
									>
										<div
											class={hoveredCollectionItem ===
												getCollectionItemKey(block.id, overlay.collectionPath, overlay.index) ||
											isSelectedItem
												? `collection-item-outline absolute inset-0 opacity-100 outline outline-1 outline-[#FDE047] transition dark:outline-[#FACC15] ${isSelectedItem ? 'outline-2' : ''}`
												: 'collection-item-outline absolute inset-0 opacity-0 outline outline-1 outline-[#FDE047] transition dark:outline-[#FACC15]'}
										></div>
										<div
											class={hoveredCollectionItem ===
											getCollectionItemKey(block.id, overlay.collectionPath, overlay.index)
												? 'collection-item-toolbar pointer-events-auto absolute top-0 left-0 flex h-8 -translate-y-full items-center overflow-hidden border border-gray-300 bg-white text-xs text-gray-900 opacity-100 shadow-[0_2px_8px_rgba(0,0,0,0.18)] transition dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100'
												: 'collection-item-toolbar pointer-events-none absolute top-0 left-0 flex h-8 -translate-y-full items-center overflow-hidden border border-gray-300 bg-white text-xs text-gray-900 opacity-0 shadow-[0_2px_8px_rgba(0,0,0,0.18)] transition dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100'}
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

						{#if !previewMode}
							<PreviewBlockInserter
								placement="after"
								edgeInset={blockIndex === blocks.length - 1}
								onToggle={() => onOpenInserter(blockIndex + 1)}
							/>
						{/if}
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
	{/if}
</div>


<style>
	.collection-overlay:focus-within .collection-outline,
	.collection-overlay:focus-within .collection-add-button {
		opacity: 1;
	}
</style>
