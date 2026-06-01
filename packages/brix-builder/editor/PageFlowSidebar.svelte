<script lang="ts">
	import type { BuilderBlock } from '../core.js';

	let {
		blocks,
		activeBlockId,
		onSelectBlock,
		onDeselectBlock,
		onMoveBlock,
		onRemoveBlock,
		onDragStart,
		onAllowDrop,
		onDrop
	}: {
		blocks: BuilderBlock[];
		activeBlockId: string | null;
		onSelectBlock: (blockId: string) => void;
		onDeselectBlock: () => void;
		onMoveBlock: (blockId: string, direction: -1 | 1) => void;
		onRemoveBlock: (blockId: string) => void;
		onDragStart: (blockId: string) => void;
		onAllowDrop: (event: DragEvent) => void;
		onDrop: (blockId: string) => void;
	} = $props();

	let openActionBlockId = $state<string | null>(null);
	let draggedBlockId = $state<string | null>(null);
	let dropTargetBlockId = $state<string | null>(null);

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

<aside class="flex h-full min-h-0 w-full flex-col border-r border-gray-200 bg-white dark:border-gray-700 dark:bg-[#111827]" aria-label="Page flow" onclick={(event) => { if (!(event.target as Element).closest('[data-page-flow-block]')) onDeselectBlock(); }}>
	<div class="min-h-0 flex-1 overflow-y-auto py-2">
		{#if blocks.length === 0}
			<p class="text-muted mx-3 border border-dashed border-gray-300 px-4 py-6 text-sm dark:border-gray-600">
				Nessun brik nella pagina.
			</p>
		{/if}

		<div role="list" aria-label="Page flow">
			{#each blocks as block (block.id)}
				{@const dropPlacement = getDropPlacement(block.id)}
				<div
					data-page-flow-block
					class={activeBlockId === block.id
						? 'relative flex items-center gap-2 border-l-4 border-[#2563EB] bg-blue-50 px-3 py-2 text-gray-900 dark:border-[#3B82F6] dark:bg-[#1e293b] dark:text-gray-100'
						: 'relative flex items-center gap-2 border-l-4 border-transparent px-3 py-2 text-gray-900 transition-colors hover:bg-gray-100 dark:text-gray-100 dark:hover:bg-gray-700'}
					role="listitem"
					draggable={true}
					ondragstart={() => startDrag(block.id)}
					ondragover={(event) => dragOverBlock(block.id, event)}
					ondragleave={(event) => leaveBlock(block.id, event)}
					ondrop={() => dropBlock(block.id)}
					ondragend={endDrag}>
					{#if dropPlacement === 'before'}
						<div class="pointer-events-none absolute -top-0.5 right-2 left-2 z-30 h-0.5 bg-[#2563EB] shadow-[0_0_0_1px_rgba(37,99,235,0.15)] dark:bg-[#3B82F6]"></div>
					{:else if dropPlacement === 'after'}
						<div class="pointer-events-none absolute right-2 -bottom-0.5 left-2 z-30 h-0.5 bg-[#2563EB] shadow-[0_0_0_1px_rgba(37,99,235,0.15)] dark:bg-[#3B82F6]"></div>
					{/if}
					<button
						type="button"
						class="absolute inset-0 z-0 cursor-pointer"
						aria-label={`Seleziona brik ${block.type}`}
						onclick={() => onSelectBlock(block.id)}></button>
					<span class="pointer-events-none relative z-10 min-w-0 flex-1 truncate text-sm font-medium">
						{block.type}
					</span>

					<div class="relative z-20 shrink-0">
						<button
							type="button"
							class="flex h-7 w-7 items-center justify-center border border-transparent text-gray-700 transition-colors hover:border-gray-300 hover:bg-white dark:text-gray-200 dark:hover:border-gray-600 dark:hover:bg-[#1f2937]"
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
								aria-label="Chiudi menu azioni"
								onclick={(event) => closeActionMenu(event)}></button>

							<div
								class="absolute right-0 z-50 mt-1 grid min-w-48 gap-1 border border-gray-200 bg-white p-1.5 text-sm shadow-lg dark:border-gray-700 dark:bg-[#1f2937]">
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
			{/each}
		</div>
	</div>
</aside>
