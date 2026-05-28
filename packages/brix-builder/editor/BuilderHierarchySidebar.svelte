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

<aside class="flex h-full min-h-0 w-[280px] shrink-0 flex-col border-r border-[#ddd] bg-white">
	<div class="flex h-12 items-center justify-between border-b border-[#ddd] px-4">
		<h1 class="text-sm font-medium text-[#1e1e1e]">Vista elenco</h1>
		<span class="text-xs text-[#757575]">{blocks.length}</span>
	</div>

	<details class="border-b border-[#ddd]" open>
		<summary class="cursor-pointer px-4 py-3 text-xs font-medium uppercase tracking-wide text-[#757575]">
			Aggiungi brik
		</summary>
		<div class="grid gap-1 px-3 pb-3">
			{#each definitions as definition (definition.type)}
				<button
					type="button"
					class="rounded-sm border border-transparent px-3 py-2 text-left text-sm text-[#1e1e1e] hover:border-[#3858e9] hover:bg-[#f0f6fc]"
					onclick={() => onAddBlock(definition.type)}>
					{definition.type}
				</button>
			{/each}
		</div>
	</details>

	<div class="min-h-0 flex-1 overflow-y-auto py-2">
		{#if blocks.length === 0}
			<p class="mx-3 border border-dashed border-[#ccc] px-4 py-6 text-sm text-[#757575]">
				Nessun brik nella pagina.
			</p>
		{/if}

		<div role="list" aria-label="Brix della pagina">
			{#each blocks as block, index (block.id)}
				{@const definition = getBuilderDefinition(block.type, definitions)}
				<div
					class={activeBlockId === block.id
						? 'border-l-4 border-[#3858e9] bg-[#f0f6fc] px-3 py-2 text-[#1e1e1e]'
						: 'border-l-4 border-transparent px-3 py-2 text-[#1e1e1e] hover:bg-[#f6f7f7]'}
					role="listitem"
					draggable={true}
					ondragstart={() => onDragStart(block.id)}
					ondragover={onAllowDrop}
					ondrop={() => onDrop(block.id)}>
					<button type="button" class="flex w-full items-center gap-2 text-left" onclick={() => onSelectBlock(block.id)}>
						<span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm border border-[#ddd] bg-white text-xs text-[#757575]">
							{index + 1}
						</span>
						<span class="min-w-0 flex-1">
							<span class="block truncate text-sm font-medium">{definition.type}</span>
							<span class="line-clamp-1 block text-xs text-[#757575]">{definition.description}</span>
						</span>
					</button>

					<div class="mt-2 ml-8 flex flex-wrap gap-1 text-xs">
						<button
							type="button"
							class="rounded-sm border border-[#ccc] bg-white px-2 py-1 text-[#1e1e1e] hover:border-[#3858e9] hover:text-[#3858e9]"
							onclick={() => onMoveBlock(block.id, -1)}>
							Su
						</button>
						<button
							type="button"
							class="rounded-sm border border-[#ccc] bg-white px-2 py-1 text-[#1e1e1e] hover:border-[#3858e9] hover:text-[#3858e9]"
							onclick={() => onMoveBlock(block.id, 1)}>
							Giu
						</button>
						<button
							type="button"
							class="rounded-sm border border-[#ccc] bg-white px-2 py-1 text-[#b32d2e] hover:border-[#b32d2e]"
							onclick={() => onRemoveBlock(block.id)}>
							Rimuovi
						</button>
					</div>
				</div>
			{/each}
		</div>
	</div>
</aside>
