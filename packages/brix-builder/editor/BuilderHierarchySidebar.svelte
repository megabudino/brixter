<script lang="ts">
	import { getBuilderDefinition } from '../editor-controller.js';
	import type { BuilderBlock } from '../core.js';
	import type { BuilderRenderDefinition } from './contracts.js';

	let {
		definitions,
		blocks,
		activeBlockId,
		onAddBlock,
		onSelectBlock,
		onMoveBlock,
		onRemoveBlock,
		onDragStart,
		onAllowDrop,
		onDrop
	}: {
		definitions: BuilderRenderDefinition[];
		blocks: BuilderBlock[];
		activeBlockId: string | null;
		onAddBlock: (type: string) => void;
		onSelectBlock: (blockId: string) => void;
		onMoveBlock: (blockId: string, direction: -1 | 1) => void;
		onRemoveBlock: (blockId: string) => void;
		onDragStart: (blockId: string) => void;
		onAllowDrop: (event: DragEvent) => void;
		onDrop: (blockId: string) => void;
	} = $props();
</script>

<aside class="flex h-full min-h-0 w-[280px] shrink-0 flex-col border-r border-gray-200 bg-white dark:border-gray-700 dark:bg-[#111827]">
	<div class="flex h-12 items-center justify-between border-b border-gray-200 px-4 dark:border-gray-700">
		<h1 class="text-heading text-sm font-medium">Vista elenco</h1>
		<span class="text-muted text-xs">{blocks.length}</span>
	</div>

	<details class="border-b border-gray-200 dark:border-gray-700" open>
		<summary class="text-muted cursor-pointer px-4 py-3 text-xs font-medium uppercase tracking-wide">
			Aggiungi brik
		</summary>
		<div class="grid gap-1 px-3 pb-3">
			{#each definitions as definition (definition.type)}
				<button
					type="button"
					class="border border-transparent px-3 py-2 text-left text-sm text-gray-900 transition-colors hover:border-[#2563EB] hover:bg-gray-100 dark:text-gray-100 dark:hover:border-[#3B82F6] dark:hover:bg-gray-700"
					onclick={() => onAddBlock(definition.type)}>
					{definition.type}
				</button>
			{/each}
		</div>
	</details>

	<div class="min-h-0 flex-1 overflow-y-auto py-2">
		{#if blocks.length === 0}
			<p class="text-muted mx-3 border border-dashed border-gray-300 px-4 py-6 text-sm dark:border-gray-600">
				Nessun brik nella pagina.
			</p>
		{/if}

		<div role="list" aria-label="Brix della pagina">
			{#each blocks as block, index (block.id)}
				{@const definition = getBuilderDefinition(block.type, definitions)}
				<div
					class={activeBlockId === block.id
						? 'border-l-4 border-[#2563EB] bg-blue-50 px-3 py-2 text-gray-900 dark:border-[#3B82F6] dark:bg-[#1e293b] dark:text-gray-100'
						: 'border-l-4 border-transparent px-3 py-2 text-gray-900 transition-colors hover:bg-gray-100 dark:text-gray-100 dark:hover:bg-gray-700'}
					role="listitem"
					draggable={true}
					ondragstart={() => onDragStart(block.id)}
					ondragover={onAllowDrop}
					ondrop={() => onDrop(block.id)}>
					<button type="button" class="flex w-full items-center gap-2 text-left" onclick={() => onSelectBlock(block.id)}>
						<span class="text-muted flex h-6 w-6 shrink-0 items-center justify-center border border-gray-200 bg-white text-xs dark:border-gray-700 dark:bg-[#1f2937]">
							{index + 1}
						</span>
						<span class="min-w-0 flex-1">
							<span class="block truncate text-sm font-medium">{definition.type}</span>
							<span class="text-muted line-clamp-1 block text-xs">{definition.description}</span>
						</span>
					</button>

					<div class="mt-2 ml-8 flex flex-wrap gap-1 text-xs">
						<button
							type="button"
							class="border border-gray-300 bg-white px-2 py-1 text-gray-900 transition-colors hover:border-[#2563EB] hover:text-[#2563EB] dark:border-gray-600 dark:bg-[#1f2937] dark:text-gray-100 dark:hover:border-[#3B82F6] dark:hover:text-[#3B82F6]"
							onclick={() => onMoveBlock(block.id, -1)}>
							Su
						</button>
						<button
							type="button"
							class="border border-gray-300 bg-white px-2 py-1 text-gray-900 transition-colors hover:border-[#2563EB] hover:text-[#2563EB] dark:border-gray-600 dark:bg-[#1f2937] dark:text-gray-100 dark:hover:border-[#3B82F6] dark:hover:text-[#3B82F6]"
							onclick={() => onMoveBlock(block.id, 1)}>
							Giu
						</button>
						<button
							type="button"
							class="border border-gray-300 bg-white px-2 py-1 text-red-600 transition-colors hover:border-red-400 dark:border-gray-600 dark:bg-[#1f2937] dark:text-red-400 dark:hover:border-red-500"
							onclick={() => onRemoveBlock(block.id)}>
							Rimuovi
						</button>
					</div>
				</div>
			{/each}
		</div>
	</div>
</aside>
