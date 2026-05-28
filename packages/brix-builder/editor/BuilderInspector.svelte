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
		onCopyMdsvex
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
	} = $props();

	const inspectorEntries = $derived(Object.entries(inspectorFields));
</script>

<aside class="flex h-full min-h-0 w-[320px] shrink-0 flex-col border-l border-[#ddd] bg-white">
	<div class="flex h-12 items-center border-b border-[#ddd] px-4">
		<h2 class="text-sm font-medium text-[#1e1e1e]">Impostazioni</h2>
	</div>

	<div class="min-h-0 flex-1 overflow-y-auto">
		<section class="border-b border-[#ddd] p-4">
			<h3 class="mb-4 text-[11px] font-semibold uppercase tracking-wide text-[#757575]">Pagina</h3>
			<label class="block space-y-2 text-sm">
				<span class="font-medium text-[#1e1e1e]">Titolo pagina</span>
				<input
					value={title}
					class="w-full rounded-sm border border-[#949494] px-2 py-1.5 text-sm focus:border-[#3858e9] focus:outline-none focus:ring-1 focus:ring-[#3858e9]"
					placeholder="Titolo della pagina"
					oninput={(event) => onTitleChange(event.currentTarget.value)} />
			</label>
			<label class="mt-4 block space-y-2 text-sm">
				<span class="font-medium text-[#1e1e1e]">Descrizione</span>
				<input
					value={description}
					class="w-full rounded-sm border border-[#949494] px-2 py-1.5 text-sm focus:border-[#3858e9] focus:outline-none focus:ring-1 focus:ring-[#3858e9]"
					placeholder="Descrizione per il frontmatter"
					oninput={(event) => onDescriptionChange(event.currentTarget.value)} />
			</label>
		</section>

		{#if activeBlock && activeDefinition}
			<section class="border-b border-[#ddd] p-4">
				<div class="mb-4">
					<p class="text-[11px] font-semibold uppercase tracking-wide text-[#757575]">Brik</p>
					<h3 class="mt-1 text-sm font-semibold text-[#1e1e1e]">{activeDefinition.type}</h3>
					<p class="mt-1 text-xs leading-5 text-[#757575]">{activeDefinition.description}</p>
				</div>

				{#if activeDefinition.mode === 'markdown'}
					<label class="block space-y-2 text-sm">
						<span class="font-medium text-[#1e1e1e]">Contenuto markdown</span>
						<textarea
							value={typeof activeBlock.props.content === 'string' ? activeBlock.props.content : ''}
							class="min-h-48 w-full rounded-sm border border-[#949494] px-2 py-1.5 font-mono text-sm focus:border-[#3858e9] focus:outline-none focus:ring-1 focus:ring-[#3858e9]"
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
					<p class="border border-dashed border-[#ccc] bg-[#f6f7f7] px-4 py-6 text-sm text-[#757575]">
						I contenuti di questo brik si modificano direttamente nella preview.
					</p>
				{/if}

				{#if propsError}
					<p class="mt-3 text-sm text-[#b32d2e]">{propsError}</p>
				{/if}
			</section>
		{:else}
			<p class="m-4 border border-dashed border-[#ccc] bg-[#f6f7f7] px-4 py-6 text-sm text-[#757575]">
				Seleziona un brik dalla gerarchia o dalla preview per modificarne le impostazioni.
			</p>
		{/if}

		<section class="border-b border-[#ddd] p-4">
			<div class="flex items-center justify-between gap-3">
				<div>
					<h3 class="text-sm font-semibold text-[#1e1e1e]">Export mdsvex</h3>
					<p class="mt-1 text-xs text-[#757575]">Export opzionale generato dal documento corrente.</p>
				</div>
				<button
					type="button"
					class="rounded-sm border border-[#1e1e1e] bg-white px-3 py-1.5 text-xs font-medium text-[#1e1e1e] hover:bg-[#f6f7f7]"
					onclick={onCopyMdsvex}>
					{copied ? 'Copiato' : 'Copia export'}
				</button>
			</div>
			<textarea
				readonly
				class="mt-3 min-h-64 w-full rounded-sm border border-[#949494] bg-white px-2 py-1.5 font-mono text-xs"
			>{mdsvexOutput}</textarea>
		</section>
	</div>
</aside>
