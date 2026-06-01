<script lang="ts">
	import { getCollectionItemSummary, type BuilderBlock, type BuilderFields } from '../core.js';
	import type { BuilderRenderDefinition } from './contracts.js';
	import BuilderFieldEditor from './BuilderFieldEditor.svelte';

	let {
		title,
		description,
		activeBlock,
		activeDefinition,
		inspectorFields,
		propsError,
		mdsvexOutput,
		copied,
		onTitleChange,
		onDescriptionChange,
		onFieldChange,
		onQueueFileEdit,
		onAddItem,
		onRemoveItem,
		onMoveItem,
		onCopyMdsvex,
		onDeselectBlock
	}: {
		title: string;
		description: string;
		activeBlock: BuilderBlock | null;
		activeDefinition: BuilderRenderDefinition | null;
		inspectorFields: BuilderFields;
		propsError: string | null;
		mdsvexOutput: string;
		copied: boolean;
		onTitleChange: (value: string) => void;
		onDescriptionChange: (value: string) => void;
		onFieldChange: (block: BuilderBlock, path: string, value: unknown) => void;
		onQueueFileEdit: (blockId: string, path: string) => void;
		onAddItem: (block: BuilderBlock, path: string) => void;
		onRemoveItem: (block: BuilderBlock, path: string, index: number) => void;
		onMoveItem: (block: BuilderBlock, path: string, index: number, direction: -1 | 1) => void;
		onCopyMdsvex: () => void;
		onDeselectBlock: () => void;
	} = $props();

	const inspectorEntries = $derived(Object.entries(inspectorFields));
</script>

<aside class="flex h-full min-h-0 w-full flex-col border-l border-gray-200 bg-white dark:border-gray-700 dark:bg-[#111827]" onclick={(event) => { if (!(event.target as Element).closest('section')) onDeselectBlock(); }}>
	<div class="min-h-0 flex-1 overflow-y-auto">
		{#if activeBlock && activeDefinition}
			<section class="p-4 dark:border-gray-700">
				<div class="mb-4">
					<p class="text-muted text-[11px] font-semibold uppercase tracking-wide">Brik</p>
					<h3 class="text-heading mt-1 text-sm font-semibold">{activeDefinition.type}</h3>
					<p class="text-muted mt-1 text-xs leading-5">{activeDefinition.description}</p>
				</div>

				{#if activeDefinition.mode === 'markdown'}
					<label class="block">
						<span class="mb-1 block text-sm font-medium text-label">Contenuto markdown</span>
						<textarea
							value={typeof activeBlock.props.content === 'string' ? activeBlock.props.content : ''}
							class="min-h-48 w-full border border-gray-300 bg-white px-4 py-3 font-mono text-sm text-gray-900 placeholder-gray-400 focus:border-[#2563EB] focus:outline-none focus:ring-1 focus:ring-[#2563EB] dark:border-gray-700 dark:bg-[#1f2937] dark:text-gray-100 dark:placeholder-gray-500 dark:focus:border-[#3B82F6] dark:focus:ring-[#3B82F6]"
							oninput={(event) => onFieldChange(activeBlock, 'content', event.currentTarget.value)}
							placeholder="Scrivi markdown..."></textarea>
					</label>
				{:else if inspectorEntries.length > 0}
					<div class="space-y-4">
						{#each inspectorEntries as [fieldKey, fieldDefinition] (fieldKey)}
							<BuilderFieldEditor
								{fieldKey}
								field={fieldDefinition}
								path={fieldKey}
								value={activeBlock.props[fieldKey]}
								onChange={(path, value) => onFieldChange(activeBlock, path, value)}
								onQueueFileEdit={(path) => onQueueFileEdit(activeBlock.id, path)}
								onAddItem={(path) => onAddItem(activeBlock, path)}
								onRemoveItem={(path, itemIndex) => onRemoveItem(activeBlock, path, itemIndex)}
								onMoveItem={(path, itemIndex, direction) =>
									onMoveItem(activeBlock, path, itemIndex, direction)} />
						{/each}
					</div>
				{:else}
					<p class="text-muted text-sm">Nothing to edit here!</p>
				{/if}

				{#if propsError}
					<p class="text-error mt-3 text-sm">{propsError}</p>
				{/if}
			</section>
		{:else}
			<section class="p-4 dark:border-gray-700">
				<h3 class="text-muted mb-4 text-[11px] font-semibold uppercase tracking-wide">Page</h3>
				<div class="space-y-4">
					<label class="block">
						<span class="mb-1 block text-sm font-medium text-label">Titolo pagina</span>
						<input
							value={title}
							class="block w-full border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-[#2563EB] focus:outline-none focus:ring-1 focus:ring-[#2563EB] dark:border-gray-700 dark:bg-[#1f2937] dark:text-gray-100 dark:placeholder-gray-500 dark:focus:border-[#3B82F6] dark:focus:ring-[#3B82F6]"
							placeholder="Titolo della pagina"
							oninput={(event) => onTitleChange(event.currentTarget.value)} />
					</label>
					<label class="block">
						<span class="mb-1 block text-sm font-medium text-label">Descrizione</span>
						<input
							value={description}
							class="block w-full border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-[#2563EB] focus:outline-none focus:ring-1 focus:ring-[#2563EB] dark:border-gray-700 dark:bg-[#1f2937] dark:text-gray-100 dark:placeholder-gray-500 dark:focus:border-[#3B82F6] dark:focus:ring-[#3B82F6]"
							placeholder="Descrizione per il frontmatter"
							oninput={(event) => onDescriptionChange(event.currentTarget.value)} />
					</label>
				</div>
			</section>
		{/if}
	</div>
</aside>
