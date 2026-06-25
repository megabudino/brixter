<script lang="ts">
	import type { BuilderBlock } from '../core.js';

	interface PageFlowItem {
		index: number;
		key: string;
		label: string;
	}

	interface PageFlowCollection {
		path: string;
		label: string;
		items: PageFlowItem[];
	}

	interface PageFlowNode {
		block: BuilderBlock;
		collections: PageFlowCollection[];
	}

	let {
		nodes,
		activeBlockId,
		activeCollectionItem,
		onSelectBlock,
		onSelectCollectionItem,
		onDeselectBlock,
		onMoveBlock,
		onRemoveBlock,
		onDragStart,
		onAllowDrop,
		onDrop
	}: {
		nodes: PageFlowNode[];
		activeBlockId: string | null;
		activeCollectionItem: { blockId: string; collectionPath: string; index: number } | null;
		onSelectBlock: (blockId: string) => void;
		onSelectCollectionItem: (blockId: string, collectionPath: string, index: number) => void;
		onDeselectBlock: () => void;
		onMoveBlock: (blockId: string, direction: -1 | 1) => void;
		onRemoveBlock: (blockId: string) => void;
		onDragStart: (blockId: string) => void;
		onAllowDrop: (event: DragEvent) => void;
		onDrop: (blockId: string) => void;
	} = $props();

	const blocks = $derived(nodes.map((node) => node.block));

	let openActionBlockId = $state<string | null>(null);
	let draggedBlockId = $state<string | null>(null);
	let dropTargetBlockId = $state<string | null>(null);
	let collapsed = $state<Set<string>>(new Set());

	// Keep the brik that owns the current selection expanded.
	$effect(() => {
		if (activeCollectionItem && collapsed.has(activeCollectionItem.blockId)) {
			const next = new Set(collapsed);
			next.delete(activeCollectionItem.blockId);
			collapsed = next;
		}
	});

	function hasChildren(node: PageFlowNode): boolean {
		return node.collections.some((collection) => collection.items.length > 0);
	}

	function isExpanded(blockId: string): boolean {
		return !collapsed.has(blockId);
	}

	function toggleExpanded(blockId: string, event: MouseEvent): void {
		event.stopPropagation();
		const next = new Set(collapsed);
		if (next.has(blockId)) {
			next.delete(blockId);
		} else {
			next.add(blockId);
		}
		collapsed = next;
	}

	function isItemActive(blockId: string, collectionPath: string, index: number): boolean {
		return (
			activeCollectionItem?.blockId === blockId &&
			activeCollectionItem?.collectionPath === collectionPath &&
			activeCollectionItem?.index === index
		);
	}

	function toggleActionMenu(blockId: string, event: MouseEvent): void {
		event.stopPropagation();
		openActionBlockId = openActionBlockId === blockId ? null : blockId;
	}

	function closeActionMenu(event?: MouseEvent): void {
		event?.stopPropagation();
		openActionBlockId = null;
	}

	function moveBlock(blockId: string, direction: -1 | 1): void {
		onMoveBlock(blockId, direction);
		closeActionMenu();
	}

	function removeBlock(blockId: string): void {
		onRemoveBlock(blockId);
		closeActionMenu();
	}

	function startDrag(blockId: string): void {
		draggedBlockId = blockId;
		dropTargetBlockId = null;
		onDragStart(blockId);
	}

	function dragOverBlock(blockId: string, event: DragEvent): void {
		onAllowDrop(event);
		dropTargetBlockId = blockId;
	}

	function leaveBlock(blockId: string, event: DragEvent): void {
		if (
			dropTargetBlockId !== blockId ||
			(event.relatedTarget instanceof Node && event.currentTarget instanceof Node && event.currentTarget.contains(event.relatedTarget))
		) {
			return;
		}

		dropTargetBlockId = null;
	}

	function dropBlock(blockId: string): void {
		onDrop(blockId);
		draggedBlockId = null;
		dropTargetBlockId = null;
	}

	function endDrag(): void {
		draggedBlockId = null;
		dropTargetBlockId = null;
	}

	function getDropPlacement(blockId: string): 'before' | 'after' | null {
		if (!draggedBlockId || draggedBlockId === blockId || dropTargetBlockId !== blockId) {
			return null;
		}

		const draggedIndex = blocks.findIndex((block) => block.id === draggedBlockId);
		const targetIndex = blocks.findIndex((block) => block.id === blockId);
		if (draggedIndex === -1 || targetIndex === -1) {
			return null;
		}

		return draggedIndex < targetIndex ? 'after' : 'before';
	}
</script>

<aside class="flex h-full min-h-0 w-full flex-col border-r border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900" aria-label="Page flow" onclick={(event) => { if (!(event.target as Element).closest('[data-page-flow-block]')) onDeselectBlock(); }}>
	<div class="min-h-0 flex-1 overflow-y-auto py-2">
		{#if nodes.length === 0}
			<p class="bx-text-muted mx-3 px-4 py-6 text-sm dark:border-gray-600">
				No brix on the page.
			</p>
		{/if}

		<div role="list" aria-label="Page flow">
			{#each nodes as node (node.block.id)}
				{@const block = node.block}
				{@const dropPlacement = getDropPlacement(block.id)}
				{@const expandable = hasChildren(node)}
				{@const expanded = isExpanded(block.id)}
				<div
					data-page-flow-block
					class={activeBlockId === block.id && !activeCollectionItem
						? 'relative flex items-center gap-2 border-l-4 border-[#FDE047] bg-yellow-50 px-3 py-2 text-gray-900 dark:border-[#FACC15] dark:bg-yellow-950/40 dark:text-gray-100'
						: 'relative flex items-center gap-2 border-l-4 border-transparent px-3 py-2 text-gray-900 transition-colors hover:bg-gray-100 dark:text-gray-100 dark:hover:bg-gray-700'}
					role="listitem"
					draggable={true}
					ondragstart={() => startDrag(block.id)}
					ondragover={(event) => dragOverBlock(block.id, event)}
					ondragleave={(event) => leaveBlock(block.id, event)}
					ondrop={() => dropBlock(block.id)}
					ondragend={endDrag}>
					{#if dropPlacement === 'before'}
						<div class="pointer-events-none absolute -top-0.5 right-2 left-2 z-30 h-0.5 bg-[#FDE047] shadow-[0_0_0_1px_rgba(253,224,71,0.15)] dark:bg-[#FACC15]"></div>
					{:else if dropPlacement === 'after'}
						<div class="pointer-events-none absolute right-2 -bottom-0.5 left-2 z-30 h-0.5 bg-[#FDE047] shadow-[0_0_0_1px_rgba(253,224,71,0.15)] dark:bg-[#FACC15]"></div>
					{/if}
					<button
						type="button"
						class="absolute inset-0 z-0 cursor-pointer"
						aria-label={`Select brik ${block.type}`}
						onclick={() => onSelectBlock(block.id)}></button>

					{#if expandable}
						<button
							type="button"
							class="relative z-20 -ml-1 flex h-4 w-4 shrink-0 items-center justify-center text-gray-500 dark:text-gray-400"
							aria-label={expanded ? `Collapse ${block.type}` : `Expand ${block.type}`}
							aria-expanded={expanded}
							onclick={(event) => toggleExpanded(block.id, event)}>
							<svg class="h-3 w-3 transition-transform {expanded ? 'rotate-90' : ''}" viewBox="0 0 16 16" aria-hidden="true">
								<path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
							</svg>
						</button>
					{:else}
						<span class="relative z-10 h-4 w-4 shrink-0"></span>
					{/if}

					<span class="pointer-events-none relative z-10 min-w-0 flex-1 truncate text-sm font-medium">
						{block.type}
					</span>

					<div class="relative z-20 shrink-0">
						<button
							type="button"
							class="flex h-7 w-7 items-center justify-center border border-transparent text-gray-700 transition-colors hover:border-gray-300 hover:bg-white dark:text-gray-200 dark:hover:border-gray-600 dark:hover:bg-gray-800"
							aria-label={`Azioni per ${block.type}`}
							aria-expanded={openActionBlockId === block.id}
							onclick={(event) => toggleActionMenu(block.id, event)}>
							<svg class="h-4 w-4 opacity-50" viewBox="0 0 16 16" aria-hidden="true">
								<circle cx="3" cy="8" r="1.4" fill="currentColor" />
								<circle cx="8" cy="8" r="1.4" fill="currentColor" />
								<circle cx="13" cy="8" r="1.4" fill="currentColor" />
							</svg>
						</button>

						{#if openActionBlockId === block.id}
							<button
								type="button"
								class="fixed inset-0 z-40 cursor-default bg-black/20 dark:bg-black/40"
								aria-label="Close actions menu"
								onclick={(event) => closeActionMenu(event)}></button>

							<div
								class="absolute right-0 z-50 mt-1 grid min-w-48 gap-1 border border-gray-200 bg-white p-1.5 text-sm shadow-lg dark:border-gray-700 dark:bg-gray-800">
								<button
									type="button"
									class="flex items-center gap-3 px-3.5 py-2 text-left text-gray-900 transition-colors hover:bg-gray-100 dark:text-gray-100 dark:hover:bg-gray-700"
									onclick={() => moveBlock(block.id, -1)}>
									<svg class="h-4 w-4" viewBox="0 0 16 16" aria-hidden="true">
										<path
											d="M8 3.25 3.75 7.5l.9.9L7.35 5.7V13h1.3V5.7l2.7 2.7.9-.9L8 3.25Z"
											fill="currentColor" />
									</svg>
									Move up
								</button>
								<button
									type="button"
									class="flex items-center gap-3 px-3.5 py-2 text-left text-gray-900 transition-colors hover:bg-gray-100 dark:text-gray-100 dark:hover:bg-gray-700"
									onclick={() => moveBlock(block.id, 1)}>
									<svg class="h-4 w-4" viewBox="0 0 16 16" aria-hidden="true">
										<path
											d="M8 12.75 3.75 8.5l.9-.9 2.7 2.7V3h1.3v7.3l2.7-2.7.9.9L8 12.75Z"
											fill="currentColor" />
									</svg>
									Move down
								</button>
								<button
									type="button"
									class="flex items-center gap-3 px-3.5 py-2 text-left text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
									onclick={() => removeBlock(block.id)}>
									<svg class="h-4 w-4" viewBox="0 0 16 16" aria-hidden="true">
										<path
											d="M6.25 2.5h3.5l.6 1.25H13V5H3V3.75h2.65l.6-1.25Zm-1.8 3.75h1.25l.35 6.25h3.9l.35-6.25h1.25l-.4 7.5H4.85l-.4-7.5Z"
											fill="currentColor" />
									</svg>
									Remove
								</button>
							</div>
						{/if}
					</div>
				</div>

				{#if expandable && expanded}
					{@const multiCollection = node.collections.filter((c) => c.items.length > 0).length > 1}
					{#each node.collections as collection (collection.path)}
						{#if collection.items.length > 0}
							{#if multiCollection}
								<p class="bx-text-muted px-3 py-1 pl-11 text-[11px] font-semibold tracking-wide uppercase">
									{collection.label}
								</p>
							{/if}
							{#each collection.items as item (item.key)}
								<div data-page-flow-block role="listitem">
									<button
										type="button"
										class={isItemActive(block.id, collection.path, item.index)
											? 'flex w-full items-center gap-2 border-l-4 border-[#FDE047] bg-yellow-50 py-1.5 pr-3 pl-11 text-left text-gray-900 dark:border-[#FACC15] dark:bg-yellow-950/40 dark:text-gray-100'
											: 'flex w-full items-center gap-2 border-l-4 border-transparent py-1.5 pr-3 pl-11 text-left text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'}
										onclick={() => onSelectCollectionItem(block.id, collection.path, item.index)}>
										<span class="shrink-0 text-gray-400 dark:text-gray-500">•</span>
										<span class="min-w-0 flex-1 truncate text-sm">{item.label}</span>
									</button>
								</div>
							{/each}
						{/if}
					{/each}
				{/if}
			{/each}
		</div>
	</div>
</aside>
