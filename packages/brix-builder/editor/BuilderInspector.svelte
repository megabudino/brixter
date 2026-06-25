<script lang="ts">
	import {
		getFieldByPath,
		getValueAtPath,
		type BuilderBlock,
		type BuilderField,
		type BuilderFields
	} from '../core.js';
	import type { LayoutDefinition } from '../svelte/adapter.js';
	import type { BuilderRenderDefinition } from './contracts.js';
	import BuilderFieldEditor from './BuilderFieldEditor.svelte';

	let {
		activeBlock,
		activeDefinition,
		inspectorFields,
		focusedItem,
		pageFields,
		pageValues,
		layouts,
		currentLayout,
		propsError,
		mdsvexOutput,
		copied,
		onLayoutChange,
		onPageFieldChange,
		onPageQueueFileEdit,
		onPageAddItem,
		onPageRemoveItem,
		onPageMoveItem,
		onFieldChange,
		onQueueFileEdit,
		onAddItem,
		onRemoveItem,
		onMoveItem,
		onCopyMdsvex,
		onDeselectBlock,
		onClearCollectionItem
	}: {
		activeBlock: BuilderBlock | null;
		activeDefinition: BuilderRenderDefinition | null;
		inspectorFields: BuilderFields;
		focusedItem: { collectionPath: string; index: number } | null;
		pageFields: BuilderFields;
		pageValues: Record<string, unknown>;
		layouts: LayoutDefinition[];
		currentLayout: string;
		propsError: string | null;
		mdsvexOutput: string;
		copied: boolean;
		onLayoutChange: (name: string) => void;
		onPageFieldChange: (path: string, value: unknown) => void;
		onPageQueueFileEdit: (path: string) => void;
		onPageAddItem: (path: string) => void;
		onPageRemoveItem: (path: string, index: number) => void;
		onPageMoveItem: (path: string, index: number, direction: -1 | 1) => void;
		onFieldChange: (block: BuilderBlock, path: string, value: unknown) => void;
		onQueueFileEdit: (blockId: string, path: string) => void;
		onAddItem: (block: BuilderBlock, path: string) => void;
		onRemoveItem: (block: BuilderBlock, path: string, index: number) => void;
		onMoveItem: (block: BuilderBlock, path: string, index: number, direction: -1 | 1) => void;
		onCopyMdsvex: () => void;
		onDeselectBlock: () => void;
		onClearCollectionItem: () => void;
	} = $props();

	const inspectorEntries = $derived(Object.entries(inspectorFields));
	const pageEntries = $derived(Object.entries(pageFields));

	// --- Per-element editing -------------------------------------------------
	// The preview is the primary editing surface: inline fields (text/richtext/
	// image/icon) are edited by clicking them in the page. So when a collection
	// item is selected, the inspector shows ONLY that element's NON-inline props.
	// `inspectorFields` is already filtered by `createInspectorField` to exactly
	// that set; we read the rendered fields from there. Metadata (label/itemLabel/
	// summaryField) comes from the full definition field.
	const focusedField = $derived<BuilderField | null>(
		focusedItem && activeDefinition
			? getFieldByPath(activeDefinition.fields, focusedItem.collectionPath)
			: null
	);
	const focusedInspectorField = $derived<BuilderField | null>(
		focusedItem ? getFieldByPath(inspectorFields, focusedItem.collectionPath) : null
	);
	const focusedItemFields = $derived<[string, BuilderField][]>(
		focusedInspectorField?.item?.fields ? Object.entries(focusedInspectorField.item.fields) : []
	);
	const focusedBasePath = $derived(
		focusedItem ? `${focusedItem.collectionPath}[${focusedItem.index}]` : null
	);
	const focusedItemValue = $derived(
		activeBlock && focusedBasePath ? getValueAtPath(activeBlock.props, focusedBasePath) : null
	);
	const focusedActive = $derived(Boolean(activeBlock && focusedItem));
	const focusedSummary = $derived.by(() => {
		if (!focusedField || !focusedItem) return '';
		const value = focusedItemValue;
		const summaryField = focusedField.summaryField;
		if (
			summaryField &&
			value &&
			typeof value === 'object' &&
			!Array.isArray(value) &&
			typeof (value as Record<string, unknown>)[summaryField] === 'string' &&
			((value as Record<string, string>)[summaryField] ?? '').trim()
		) {
			return (value as Record<string, string>)[summaryField];
		}
		return `${focusedField.itemLabel ?? 'Item'} ${focusedItem.index + 1}`;
	});

	function getObjectValue(source: unknown, key: string): unknown {
		if (!source || typeof source !== 'object' || Array.isArray(source)) {
			return undefined;
		}
		return (source as Record<string, unknown>)[key];
	}
</script>

<aside
	class="flex h-full min-h-0 w-full flex-col border-l border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900"
	onclick={(event) => {
		if (!(event.target as Element).closest('section')) onDeselectBlock();
	}}
>
	<div class="min-h-0 flex-1 overflow-y-auto">
		{#if activeBlock && activeDefinition}
			<section class="p-4 dark:border-gray-700">
				{#if focusedActive && focusedItem}
					<button
						type="button"
						class="bx-text-muted mb-4 inline-flex items-center gap-1 text-xs font-medium hover:underline"
						onclick={onClearCollectionItem}
					>
						← {focusedField?.label ?? focusedItem.collectionPath}
					</button>
					<div class="mb-4">
						<p class="bx-text-muted text-[11px] font-semibold tracking-wide uppercase">
							{focusedField?.itemLabel ?? 'Item'}
						</p>
						<h3 class="bx-text-heading mt-1 text-sm font-semibold">{focusedSummary}</h3>
					</div>

					{#if focusedItemFields.length > 0}
						<div class="space-y-4">
							{#each focusedItemFields as [itemFieldKey, itemFieldDefinition] (itemFieldKey)}
								<BuilderFieldEditor
									fieldKey={itemFieldKey}
									field={itemFieldDefinition}
									path={`${focusedBasePath}.${itemFieldKey}`}
									value={getObjectValue(focusedItemValue, itemFieldKey)}
									onChange={(path, value) => onFieldChange(activeBlock, path, value)}
									onQueueFileEdit={(path) => onQueueFileEdit(activeBlock.id, path)}
									onAddItem={(path) => onAddItem(activeBlock, path)}
									onRemoveItem={(path, itemIndex) => onRemoveItem(activeBlock, path, itemIndex)}
									onMoveItem={(path, itemIndex, direction) =>
										onMoveItem(activeBlock, path, itemIndex, direction)}
								/>
							{/each}
						</div>
					{:else}
						<p class="bx-text-muted text-sm leading-6">
							This element has no extra settings — edit its content directly in the preview.
						</p>
					{/if}
				{:else}
					<div class="mb-4">
						<p class="bx-text-muted text-[11px] font-semibold tracking-wide uppercase">Brik</p>
						<h3 class="bx-text-heading mt-1 text-sm font-semibold">{activeDefinition.type}</h3>
						<p class="bx-text-muted mt-1 text-xs leading-5">{activeDefinition.description}</p>
					</div>

					{#if activeDefinition.mode === 'markdown'}
						<label class="block">
							<span class="bx-text-label mb-1 block text-sm font-medium">Contenuto markdown</span>
							<textarea
								value={typeof activeBlock.props.content === 'string' ? activeBlock.props.content : ''}
								class="min-h-48 w-full border border-gray-300 bg-white px-4 py-3 font-mono text-sm text-gray-900 placeholder-gray-400 focus:border-[#FDE047] focus:ring-1 focus:ring-[#FDE047] focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500 dark:focus:border-[#FACC15] dark:focus:ring-[#FACC15]"
								oninput={(event) => onFieldChange(activeBlock, 'content', event.currentTarget.value)}
								placeholder="Scrivi markdown..."
							></textarea>
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
										onMoveItem(activeBlock, path, itemIndex, direction)}
								/>
							{/each}
						</div>
					{:else}
						<p class="bx-text-muted text-sm">Nothing to edit here!</p>
					{/if}
				{/if}

				{#if propsError}
					<p class="bx-text-error mt-3 text-sm">{propsError}</p>
				{/if}
			</section>
		{:else}
			<section class="p-4 dark:border-gray-700">
				<h3 class="bx-text-muted mb-4 text-[11px] font-semibold tracking-wide uppercase">Page</h3>
				<div class="space-y-4">
					{#if layouts.length > 0}
						<label class="block">
							<span class="bx-text-label mb-1 block text-sm font-medium">Layout</span>
							<select
								value={currentLayout}
								class="block w-full border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 focus:border-[#FDE047] focus:ring-1 focus:ring-[#FDE047] focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:focus:border-[#FACC15] dark:focus:ring-[#FACC15]"
								onchange={(event) => onLayoutChange(event.currentTarget.value)}
							>
								<option value="">No layout</option>
								{#each layouts as layout (layout.name)}
									<option value={layout.name}>{layout.name}</option>
								{/each}
							</select>
						</label>
					{/if}

					{#each pageEntries as [fieldKey, fieldDefinition] (fieldKey)}
						<BuilderFieldEditor
							{fieldKey}
							field={fieldDefinition}
							path={fieldKey}
							value={pageValues[fieldKey]}
							onChange={onPageFieldChange}
							onQueueFileEdit={onPageQueueFileEdit}
							onAddItem={onPageAddItem}
							onRemoveItem={onPageRemoveItem}
							onMoveItem={onPageMoveItem}
						/>
					{/each}
				</div>
			</section>
		{/if}
	</div>
</aside>
