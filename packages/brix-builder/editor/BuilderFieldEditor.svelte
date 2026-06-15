<script lang="ts">
	import BuilderFieldEditor from './BuilderFieldEditor.svelte';
	import RichTextEditor from './RichTextEditor.svelte';
	import {
		inferBuilderFieldKind,
		isRichTextValue,
		type BuilderField,
		type BuilderRichTextValue
	} from '../core.js';

	let {
		fieldKey,
		field,
		path,
		value,
		onChange,
		onQueueFileEdit,
		onAddItem,
		onRemoveItem,
		onMoveItem
	}: {
		fieldKey: string;
		field: BuilderField;
		path: string;
		value: unknown;
		onChange: (path: string, value: unknown) => void;
		onQueueFileEdit: (path: string) => void;
		onAddItem: (path: string) => void;
		onRemoveItem: (path: string, index: number) => void;
		onMoveItem: (path: string, index: number, direction: -1 | 1) => void;
	} = $props();

	const fieldKind = $derived(inferBuilderFieldKind(field));
	const label = $derived(field.label ?? humanizeFieldKey(fieldKey));
	const objectEntries = $derived(Object.entries(field.fields ?? {}));
	const arrayItems = $derived(Array.isArray(value) ? value : []);
	const stringValue = $derived(typeof value === 'string' ? value : '');
	const numberValue = $derived(typeof value === 'number' ? value : 0);
	const booleanValue = $derived(value === true);
	const richTextValue = $derived(
		isRichTextValue(value)
			? value
			: ({
					kind: 'richtext',
					mode: fieldKind === 'richtext-inline' ? 'inline' : 'block',
					html: '',
					json: null
				} satisfies BuilderRichTextValue)
	);
	const multiline = $derived(
		stringValue.includes('\n') ||
			stringValue.length > 120 ||
			/quote|subtitle|description|content/i.test(label)
	);

	function updateText(nextValue: string): void {
		onChange(path, nextValue);
	}

	function updateNumber(nextValue: string): void {
		const parsedValue = Number(nextValue);
		onChange(path, Number.isFinite(parsedValue) ? parsedValue : 0);
	}

	function updateBoolean(nextValue: boolean): void {
		onChange(path, nextValue);
	}

	function getObjectValue(source: unknown, key: string): unknown {
		if (!source || typeof source !== 'object' || Array.isArray(source)) {
			return undefined;
		}

		return (source as Record<string, unknown>)[key];
	}

	function getItemLabel(item: unknown, index: number): string {
		if (
			field.summaryField &&
			item &&
			typeof item === 'object' &&
			!Array.isArray(item) &&
			typeof (item as Record<string, unknown>)[field.summaryField] === 'string'
		) {
			return (item as Record<string, string>)[field.summaryField];
		}

		return `${field.itemLabel ?? 'Elemento'} ${index + 1}`;
	}

	function humanizeFieldKey(value: string): string {
		return value
			.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
			.replace(/[-_]/g, ' ')
			.replace(/\s+/g, ' ')
			.trim()
			.replace(/^\w/, (match) => match.toUpperCase());
	}
</script>

{#if fieldKind === 'object' && field.fields}
	<div class="space-y-3 border-t border-gray-200 pt-4 dark:border-gray-700">
		<p class="bx-text-heading text-sm font-semibold">{label}</p>

		{#each objectEntries as [nestedKey, nestedField] (nestedKey)}
			<BuilderFieldEditor
				fieldKey={nestedKey}
				field={nestedField}
				path={`${path}.${nestedKey}`}
				value={getObjectValue(value, nestedKey)}
				{onChange}
				{onQueueFileEdit}
				{onAddItem}
				{onRemoveItem}
				{onMoveItem} />
		{/each}
	</div>
{:else if fieldKind === 'array' && field.item}
	<div class="space-y-3 border-t border-gray-200 pt-4 dark:border-gray-700">
		<div class="flex items-center justify-between gap-3">
			<p class="bx-text-heading text-sm font-semibold">{label}</p>
			<button
				type="button"
				class="border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-900 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
				onclick={() => onAddItem(path)}>
				+ Add {field.itemLabel ?? 'item'}
			</button>
		</div>

		{#if arrayItems.length === 0}
			<p class="bx-text-muted text-sm">No items configured.</p>
		{/if}

		{#each arrayItems as item, index (`${path}-${index}`)}
			<div class="space-y-3 border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
				<div class="flex items-center justify-between gap-3">
					<p class="bx-text-heading text-sm font-medium">{getItemLabel(item, index)}</p>
					<div class="flex flex-wrap gap-2">
						<button
							type="button"
							class="border border-gray-300 px-2 py-1 text-xs transition-colors hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-700"
							onclick={() => onMoveItem(path, index, -1)}>
							Up
						</button>
						<button
							type="button"
							class="border border-gray-300 px-2 py-1 text-xs transition-colors hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-700"
							onclick={() => onMoveItem(path, index, 1)}>
							Down
						</button>
						<button
							type="button"
							class="border border-red-300 px-2 py-1 text-xs text-red-600 transition-colors hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
							onclick={() => onRemoveItem(path, index)}>
							Remove
						</button>
					</div>
				</div>

				{#if field.item.fields}
					{#each Object.entries(field.item.fields) as [nestedKey, nestedField] (nestedKey)}
						<BuilderFieldEditor
							fieldKey={nestedKey}
							field={nestedField}
							path={`${path}[${index}].${nestedKey}`}
							value={getObjectValue(item, nestedKey)}
							{onChange}
							{onQueueFileEdit}
							{onAddItem}
							{onRemoveItem}
							{onMoveItem} />
					{/each}
				{:else}
					<BuilderFieldEditor
						fieldKey={`${fieldKey}-${index}`}
						field={field.item}
						path={`${path}[${index}]`}
						value={item}
						{onChange}
						{onQueueFileEdit}
						{onAddItem}
						{onRemoveItem}
						{onMoveItem} />
				{/if}
			</div>
		{/each}
	</div>
{:else if fieldKind === 'richtext-inline' || fieldKind === 'richtext-block'}
	<label class="block">
		<span class="mb-1 block text-sm font-medium bx-text-label">{label}</span>
		<RichTextEditor
			value={richTextValue}
			mode={fieldKind === 'richtext-inline' ? 'inline' : 'block'}
			onChange={(nextValue) => onChange(path, nextValue)} />
	</label>
{:else if fieldKind === 'boolean'}
	<label class="flex items-center gap-3 border border-gray-200 bg-gray-50 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800">
		<input
			type="checkbox"
			checked={booleanValue}
			class="h-4 w-4 rounded border-gray-300 dark:border-gray-600"
			onchange={(event) => updateBoolean(event.currentTarget.checked)} />
		<span class="text-sm font-medium bx-text-label">{label}</span>
	</label>
{:else if fieldKind === 'number'}
	<label class="block">
		<span class="mb-1 block text-sm font-medium bx-text-label">{label}</span>
		<input
			type="number"
			value={numberValue}
			class="block w-full border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-[#FDE047] focus:outline-none focus:ring-1 focus:ring-[#FDE047] dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500 dark:focus:border-[#FACC15] dark:focus:ring-[#FACC15]"
			oninput={(event) => updateNumber(event.currentTarget.value)} />
	</label>
{:else if fieldKind === 'image'}
	<label class="block">
		<span class="mb-1 block text-sm font-medium bx-text-label">{label}</span>
		{#if stringValue}
			<img
				src={stringValue}
				alt={label}
				class="mb-2 h-24 w-24 border border-gray-200 object-cover dark:border-gray-700" />
		{/if}
		<div class="flex flex-wrap gap-2">
			<input
				type="text"
				value={stringValue}
				class="min-w-0 flex-1 border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-[#FDE047] focus:outline-none focus:ring-1 focus:ring-[#FDE047] dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500 dark:focus:border-[#FACC15] dark:focus:ring-[#FACC15]"
				oninput={(event) => updateText(event.currentTarget.value)} />
			<button
				type="button"
				class="border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-900 transition-colors hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
				onclick={() => onQueueFileEdit(path)}>
				File
			</button>
		</div>
	</label>
{:else if fieldKind === 'icon'}
	<label class="block">
		<span class="mb-1 block text-sm font-medium bx-text-label">{label}</span>
		<div class="flex flex-wrap gap-2">
			<div class="min-w-0 flex-1 flex items-center justify-center h-[46px] border border-gray-300 bg-white px-4 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100">
				{#if stringValue}
					<span class="inline-block h-6 w-6 text-gray-700 dark:text-gray-300">
						{@html stringValue}
					</span>
				{:else}
					<span class="text-gray-400 dark:text-gray-500 text-xs">No icon</span>
				{/if}
			</div>
			<button
				type="button"
				class="border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-900 transition-colors hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
				onclick={() => onQueueFileEdit(path)}>
				Choose
			</button>
		</div>
	</label>
{:else}
	<label class="block">
		<span class="mb-1 block text-sm font-medium bx-text-label">{label}</span>
		{#if multiline}
			<textarea
				value={stringValue}
				class="min-h-24 w-full border border-gray-300 bg-white px-4 py-3 font-mono text-sm text-gray-900 placeholder-gray-400 focus:border-[#FDE047] focus:outline-none focus:ring-1 focus:ring-[#FDE047] dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500 dark:focus:border-[#FACC15] dark:focus:ring-[#FACC15]"
				oninput={(event) => updateText(event.currentTarget.value)}></textarea>
		{:else}
			<input
				type="text"
				value={stringValue}
				class="block w-full border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-[#FDE047] focus:outline-none focus:ring-1 focus:ring-[#FDE047] dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500 dark:focus:border-[#FACC15] dark:focus:ring-[#FACC15]"
				oninput={(event) => updateText(event.currentTarget.value)} />
		{/if}
	</label>
{/if}
