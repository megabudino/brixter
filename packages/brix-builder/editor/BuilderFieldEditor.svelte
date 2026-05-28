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
	<div class="space-y-3 border-t border-[#ddd] pt-4">
		<p class="text-sm font-semibold text-[#1e1e1e]">{label}</p>

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
	<div class="space-y-3 border-t border-[#ddd] pt-4">
		<div class="flex items-center justify-between gap-3">
			<p class="text-sm font-semibold text-[#1e1e1e]">{label}</p>
			<button
				type="button"
				class="rounded-sm border border-[#1e1e1e] bg-white px-2 py-1 text-xs font-medium text-[#1e1e1e] hover:bg-[#f6f7f7]"
				onclick={() => onAddItem(path)}>
				+Aggiungi {field.itemLabel ?? 'elemento'}
			</button>
		</div>

		{#if arrayItems.length === 0}
			<p class="text-sm text-[#757575]">Nessun elemento configurato.</p>
		{/if}

		{#each arrayItems as item, index (`${path}-${index}`)}
			<div class="space-y-3 border border-[#ddd] bg-white p-3">
				<div class="flex items-center justify-between gap-3">
					<p class="text-sm font-medium text-[#1e1e1e]">{getItemLabel(item, index)}</p>
					<div class="flex flex-wrap gap-2">
						<button
							type="button"
							class="rounded-sm border border-[#ccc] px-2 py-1 text-xs"
							onclick={() => onMoveItem(path, index, -1)}>
							Su
						</button>
						<button
							type="button"
							class="rounded-sm border border-[#ccc] px-2 py-1 text-xs"
							onclick={() => onMoveItem(path, index, 1)}>
							Giu
						</button>
						<button
							type="button"
							class="rounded-sm border border-[#b32d2e] px-2 py-1 text-xs text-[#b32d2e]"
							onclick={() => onRemoveItem(path, index)}>
							Rimuovi
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
	<label class="block space-y-2 text-sm">
		<span class="font-medium text-[#1e1e1e]">{label}</span>
		<RichTextEditor
			value={richTextValue}
			mode={fieldKind === 'richtext-inline' ? 'inline' : 'block'}
			onChange={(nextValue) => onChange(path, nextValue)} />
	</label>
{:else if fieldKind === 'boolean'}
	<label class="flex items-center gap-3 border border-[#ddd] bg-[#f6f7f7] px-3 py-2 text-sm">
		<input
			type="checkbox"
			checked={booleanValue}
			class="h-4 w-4 rounded border-gray-300"
			onchange={(event) => updateBoolean(event.currentTarget.checked)} />
		<span class="font-medium text-[#1e1e1e]">{label}</span>
	</label>
{:else if fieldKind === 'number'}
	<label class="block space-y-2 text-sm">
		<span class="font-medium text-[#1e1e1e]">{label}</span>
		<input
			type="number"
			value={numberValue}
			class="w-full rounded-sm border border-[#949494] px-2 py-1.5 focus:border-[#3858e9] focus:outline-none focus:ring-1 focus:ring-[#3858e9]"
			oninput={(event) => updateNumber(event.currentTarget.value)} />
	</label>
{:else if fieldKind === 'image'}
	<label class="block space-y-2 text-sm">
		<span class="font-medium text-[#1e1e1e]">{label}</span>
		{#if stringValue}
			<img
				src={stringValue}
				alt={label}
				class="h-24 w-24 border border-[#ddd] object-cover" />
		{/if}
		<div class="flex flex-wrap gap-2">
			<input
				type="text"
				value={stringValue}
				class="min-w-0 flex-1 rounded-sm border border-[#949494] px-2 py-1.5 focus:border-[#3858e9] focus:outline-none focus:ring-1 focus:ring-[#3858e9]"
				oninput={(event) => updateText(event.currentTarget.value)} />
			<button
				type="button"
				class="rounded-sm border border-[#1e1e1e] px-3 py-1.5 font-medium text-[#1e1e1e] hover:bg-[#f6f7f7]"
				onclick={() => onQueueFileEdit(path)}>
				File
			</button>
		</div>
	</label>
{:else}
	<label class="block space-y-2 text-sm">
		<span class="font-medium text-[#1e1e1e]">{label}</span>
		{#if multiline}
			<textarea
				value={stringValue}
				class="min-h-24 w-full rounded-sm border border-[#949494] px-2 py-1.5 font-mono text-sm focus:border-[#3858e9] focus:outline-none focus:ring-1 focus:ring-[#3858e9]"
				oninput={(event) => updateText(event.currentTarget.value)}></textarea>
		{:else}
			<input
				type="text"
				value={stringValue}
				class="w-full rounded-sm border border-[#949494] px-2 py-1.5 focus:border-[#3858e9] focus:outline-none focus:ring-1 focus:ring-[#3858e9]"
				oninput={(event) => updateText(event.currentTarget.value)} />
		{/if}
	</label>
{/if}
