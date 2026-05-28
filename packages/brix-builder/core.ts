export type BuilderMode = 'component' | 'markdown';
export type BuilderBindingType = 'image' | 'richtext' | 'text';
export type BuilderFieldKind =
	| 'text'
	| 'boolean'
	| 'number'
	| 'object'
	| 'array'
	| 'image'
	| 'richtext-inline'
	| 'richtext-block';

export interface BuilderRichTextValue {
	kind: 'richtext';
	mode: 'inline' | 'block';
	html: string;
	json: Record<string, unknown> | null;
}

export interface BuilderField {
	kind?: BuilderFieldKind;
	label?: string;
	description?: string;
	default?: unknown;
	fields?: BuilderFields;
	item?: BuilderField;
	itemLabel?: string;
	summaryField?: string;
	imageField?: string;
	previewInMarkup?: boolean;
	previewSelector?: string;
	previewLabel?: string;
}

export type BuilderFields = Record<string, BuilderField>;

export interface BuilderBlock {
	id: string;
	type: string;
	props: Record<string, unknown>;
}

export interface BuilderDocument {
	title: string;
	description: string;
	blocks: BuilderBlock[];
}

export interface BuilderPreviewBinding {
	type: BuilderBindingType;
	selector: string;
	path: string;
	label?: string;
	richTextMode?: BuilderRichTextValue['mode'];
}

export interface BuilderCollection {
	path: string;
	label: string;
	itemLabel: string;
	defaultItem: Record<string, unknown>;
	summaryField?: string;
	imageField?: string;
	previewSelector?: string;
}

export interface BuilderDefinition {
	type: string;
	path: string;
	description: string;
	mode: BuilderMode;
	defaults: Record<string, unknown>;
	previewBindings: BuilderPreviewBinding[];
	collections: BuilderCollection[];
	fields: BuilderFields;
}

export function createRichTextValue(
	mode: BuilderRichTextValue['mode'],
	html = ''
): BuilderRichTextValue {
	return {
		kind: 'richtext',
		mode,
		html,
		json: null
	};
}

export function isRichTextValue(value: unknown): value is BuilderRichTextValue {
	return (
		isRecord(value) &&
		value.kind === 'richtext' &&
		(value.mode === 'inline' || value.mode === 'block') &&
		typeof value.html === 'string' &&
		(value.json === null || isRecord(value.json))
	);
}

export function inferBuilderFieldKind(field: BuilderField): BuilderFieldKind {
	if (field.kind) {
		return field.kind;
	}

	if (field.fields) {
		return 'object';
	}

	if (field.item) {
		return 'array';
	}

	if (typeof field.default === 'boolean') {
		return 'boolean';
	}

	if (typeof field.default === 'number') {
		return 'number';
	}

	return 'text';
}

export function createBuilderDefaultsFromFields(fields: BuilderFields): Record<string, unknown> {
	return Object.fromEntries(
		Object.entries(fields).map(([key, field]) => [key, createBuilderFieldDefault(field)])
	);
}

export function createBuilderCollectionsFromFields(
	fields: BuilderFields,
	basePath = ''
): BuilderCollection[] {
	const collections: BuilderCollection[] = [];

	for (const [name, field] of Object.entries(fields)) {
		const path = basePath ? `${basePath}.${name}` : name;
		const kind = inferBuilderFieldKind(field);

		if (kind === 'array' && field.item) {
			const defaultItem = createBuilderFieldDefault(field.item);
			const previewField = findPreviewImageField(field.item);

			if (isRecord(defaultItem)) {
				const summaryField = field.summaryField ?? inferSummaryField(field.item);
				collections.push({
					path,
					label: field.label ?? humanizeKey(name),
					itemLabel: field.itemLabel ?? humanizeKey(name).replace(/i$/i, 'o'),
					defaultItem,
					summaryField,
					imageField: field.imageField ?? previewField?.path,
					previewSelector: field.previewSelector ?? getCollectionPreviewSelector(path)
				});
			}

			continue;
		}

		if (kind === 'object' && field.fields) {
			collections.push(...createBuilderCollectionsFromFields(field.fields, path));
		}
	}

	return collections;
}

export function createBuilderPreviewBindingsFromFields(
	fields: BuilderFields,
	basePath = ''
): BuilderPreviewBinding[] {
	const bindings: BuilderPreviewBinding[] = [];

	for (const [name, field] of Object.entries(fields)) {
		const kind = inferBuilderFieldKind(field);
		const path = basePath ? `${basePath}.${name}` : name;
		const selector = getFieldPreviewSelector(field, path);

		if (kind === 'image' && selector) {
			bindings.push({
				type: 'image',
				selector,
				path,
				label: field.previewLabel ?? (field.label ? `Sostituisci ${field.label.toLowerCase()}` : undefined)
			});
			continue;
		}

		if ((kind === 'richtext-inline' || kind === 'richtext-block') && selector) {
			bindings.push({
				type: 'richtext',
				selector,
				path,
				label: field.previewLabel ?? field.label,
				richTextMode: kind === 'richtext-inline' ? 'inline' : 'block'
			});
			continue;
		}

		if (kind === 'text' && selector) {
			bindings.push({
				type: 'text',
				selector,
				path,
				label: field.previewLabel ?? field.label
			});
			continue;
		}

		if (kind === 'object' && field.fields) {
			bindings.push(...createBuilderPreviewBindingsFromFields(field.fields, path));
			continue;
		}

		if (kind === 'array' && field.item) {
			const itemPath = `${path}[]`;

			if (field.item.fields) {
				bindings.push(...createBuilderPreviewBindingsFromFields(field.item.fields, itemPath));
			}
		}
	}

	return bindings;
}

export function createInspectorFieldsFromFields(fields: BuilderFields): BuilderFields {
	return Object.fromEntries(
		Object.entries(fields)
			.map(([key, field]) => [key, createInspectorField(field)] as const)
			.filter((entry): entry is readonly [string, BuilderField] => Boolean(entry[1]))
	);
}

function createInspectorField(field: BuilderField): BuilderField | null {
	const kind = inferBuilderFieldKind(field);
	const isPreviewEditable =
		Boolean(field.previewSelector || field.previewInMarkup) &&
		(kind === 'text' || kind === 'image' || kind === 'richtext-inline' || kind === 'richtext-block');

	if (isPreviewEditable) {
		return null;
	}

	if (kind === 'object' && field.fields) {
		const nestedFields = createInspectorFieldsFromFields(field.fields);
		if (Object.keys(nestedFields).length === 0) {
			return null;
		}

		return {
			...field,
			fields: nestedFields
		};
	}

	if (kind === 'array' && field.item?.fields) {
		const nestedItemFields = createInspectorFieldsFromFields(field.item.fields);
		if (Object.keys(nestedItemFields).length === 0) {
			return null;
		}

		return {
			...field,
			item: {
				...field.item,
				fields: nestedItemFields
			}
		};
	}

	return cloneValue(field);
}

export function normalizeBuilderPropsForRender(value: unknown): unknown {
	if (isRichTextValue(value)) {
		return value.html;
	}

	if (Array.isArray(value)) {
		return value.map((entry) => normalizeBuilderPropsForRender(entry));
	}

	if (isRecord(value)) {
		return Object.fromEntries(
			Object.entries(value).map(([key, entry]) => [key, normalizeBuilderPropsForRender(entry)])
		);
	}

	return value;
}

export function createBuilderDocument(definitions: BuilderDefinition[]): BuilderDocument {
	const markdownBlock = definitions.find((definition) => definition.mode === 'markdown');
	const firstComponentBlock = definitions.find((definition) => definition.mode === 'component');
	const initialBlocks: BuilderDefinition[] = [];

	if (markdownBlock) {
		initialBlocks.push(markdownBlock);
	}

	if (firstComponentBlock) {
		initialBlocks.push(firstComponentBlock);
	}

	return {
		title: 'Pagina Brixter',
		description: 'Bozza generata da Brixter.',
		blocks: initialBlocks.map((definition) => createBlock(definition.type, definitions))
	};
}

export function createBlock(type: string, definitions: BuilderDefinition[]): BuilderBlock {
	const definition = getDefinition(type, definitions);

	return {
		id: createId(),
		type: definition.type,
		props: cloneValue(definition.defaults)
	};
}

export function getDefinition(type: string, definitions: BuilderDefinition[]): BuilderDefinition {
	const definition = definitions.find((entry) => entry.type === type);

	if (!definition) {
		throw new Error(`Unknown brik type: ${type}`);
	}

	return definition;
}

export function getPropsDraft(block: BuilderBlock): string {
	return JSON.stringify(block.props, null, 2);
}

export function parsePropsDraft(value: string): Record<string, unknown> {
	if (!value.trim()) {
		return {};
	}

	const parsed = JSON.parse(value) as unknown;
	if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
		throw new Error('Le props devono essere un oggetto JSON.');
	}

	return parsed as Record<string, unknown>;
}

export function updatePropsAtPath(
	props: Record<string, unknown>,
	path: string,
	value: unknown
): Record<string, unknown> {
	const clone = cloneValue(props);
	const segments = parsePath(path);

	if (segments.length === 0) {
		throw new Error('Path non valido.');
	}

	let current: unknown = clone;

	for (let index = 0; index < segments.length - 1; index++) {
		const segment = segments[index];
		const nextSegment = segments[index + 1];

		if (typeof segment === 'number') {
			if (!Array.isArray(current)) {
				throw new Error(`Il segmento ${segment} richiede un array.`);
			}

			if (current[segment] === undefined) {
				current[segment] = typeof nextSegment === 'number' ? [] : {};
			}

			current = current[segment];
			continue;
		}

		if (!current || typeof current !== 'object' || Array.isArray(current)) {
			throw new Error(`Il segmento "${segment}" richiede un oggetto.`);
		}

		const record = current as Record<string, unknown>;
		if (record[segment] === undefined) {
			record[segment] = typeof nextSegment === 'number' ? [] : {};
		}

		current = record[segment];
	}

	const lastSegment = segments.at(-1);
	if (lastSegment === undefined) {
		throw new Error('Path non valido.');
	}

	if (typeof lastSegment === 'number') {
		if (!Array.isArray(current)) {
			throw new Error(`Il segmento ${lastSegment} richiede un array.`);
		}

		current[lastSegment] = value;
		return clone;
	}

	if (!current || typeof current !== 'object' || Array.isArray(current)) {
		throw new Error(`Il segmento "${lastSegment}" richiede un oggetto.`);
	}

	(current as Record<string, unknown>)[lastSegment] = value;
	return clone;
}

export function getValueAtPath(props: Record<string, unknown>, path: string): unknown {
	const segments = parsePath(path);
	let current: unknown = props;

	for (const segment of segments) {
		if (typeof segment === 'number') {
			if (!Array.isArray(current)) {
				return undefined;
			}

			current = current[segment];
			continue;
		}

		if (!current || typeof current !== 'object' || Array.isArray(current)) {
			return undefined;
		}

		current = (current as Record<string, unknown>)[segment];
	}

	return current;
}

export function getCollectionItems(
	props: Record<string, unknown>,
	collection: BuilderCollection
): Array<Record<string, unknown>> {
	const value = getValueAtPath(props, collection.path);

	if (!Array.isArray(value)) {
		return [];
	}

	return value.filter(isRecord);
}

export function addCollectionItem(
	props: Record<string, unknown>,
	collection: BuilderCollection
): Record<string, unknown> {
	const items = getCollectionItems(props, collection);
	return updatePropsAtPath(props, collection.path, [...items, cloneValue(collection.defaultItem)]);
}

export function removeCollectionItem(
	props: Record<string, unknown>,
	collection: BuilderCollection,
	index: number
): Record<string, unknown> {
	const items = getCollectionItems(props, collection);
	if (index < 0 || index >= items.length) {
		return props;
	}

	return updatePropsAtPath(
		props,
		collection.path,
		items.filter((_, itemIndex) => itemIndex !== index)
	);
}

export function moveCollectionItem(
	props: Record<string, unknown>,
	collection: BuilderCollection,
	index: number,
	direction: -1 | 1
): Record<string, unknown> {
	return reorderCollectionItem(props, collection, index, index + direction);
}

export function reorderCollectionItem(
	props: Record<string, unknown>,
	collection: BuilderCollection,
	fromIndex: number,
	toIndex: number
): Record<string, unknown> {
	const items = [...getCollectionItems(props, collection)];

	if (
		fromIndex < 0 ||
		fromIndex >= items.length ||
		toIndex < 0 ||
		toIndex >= items.length ||
		fromIndex === toIndex
	) {
		return props;
	}

	const [item] = items.splice(fromIndex, 1);
	items.splice(toIndex, 0, item);
	return updatePropsAtPath(props, collection.path, items);
}

export function getCollectionItemSummary(
	item: Record<string, unknown>,
	collection: BuilderCollection,
	index: number
): string {
	if (collection.summaryField) {
		const summary = getValueAtPath(item, collection.summaryField);
		if (typeof summary === 'string' && summary.trim()) {
			return summary;
		}
	}

	return `${collection.itemLabel} ${index + 1}`;
}

export function getCollectionItemImagePath(
	collection: BuilderCollection,
	index: number
): string | null {
	if (!collection.imageField) {
		return null;
	}

	return `${collection.path}[${index}].${collection.imageField}`;
}

export function serializeToMdsvex(
	document: BuilderDocument,
	definitions: BuilderDefinition[]
): string {
	const sections: string[] = [
		'---',
		`title: ${document.title}`,
		`description: ${document.description}`,
		'---'
	];

	const componentBlocks = document.blocks
		.map((block, index) => ({ block, index, definition: getDefinition(block.type, definitions) }))
		.filter((entry) => entry.definition.mode === 'component');

	if (componentBlocks.length > 0) {
		const scriptLines = ['<script>'];
		const importedTypes = new Set<string>();

		for (const { definition } of componentBlocks) {
			if (importedTypes.has(definition.type)) continue;

			scriptLines.push(`\timport ${definition.type} from '${definition.path}';`);
			importedTypes.add(definition.type);
		}

		for (const { block, index } of componentBlocks) {
			scriptLines.push(
				`\tconst blockProps${index + 1} = ${JSON.stringify(normalizeBuilderPropsForRender(block.props), null, 2)};`
			);
		}

		scriptLines.push('</script>');
		sections.push(scriptLines.join('\n'));
	}

	for (const [index, block] of document.blocks.entries()) {
		const definition = getDefinition(block.type, definitions);

		if (definition.mode === 'markdown') {
			const content = typeof block.props.content === 'string' ? block.props.content : '';
			sections.push(content.trim() || '<!-- Brik markdown vuoto -->');
			continue;
		}

		sections.push(`<${definition.type} {...blockProps${index + 1}} />`);
	}

	return sections.join('\n\n');
}

function cloneValue<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

function createBuilderFieldDefault(field: BuilderField, defaultValue = field.default): unknown {
	const kind = inferBuilderFieldKind(field);

	if (kind === 'richtext-inline' || kind === 'richtext-block') {
		return createRichTextValue(kind === 'richtext-inline' ? 'inline' : 'block', asString(defaultValue));
	}

	if (kind === 'object') {
		const nestedDefaults = field.fields ? createBuilderDefaultsFromFields(field.fields) : {};

		if (!isRecord(defaultValue)) {
			return nestedDefaults;
		}

		const mergedDefaults: Record<string, unknown> = { ...nestedDefaults };

		for (const [key, value] of Object.entries(defaultValue)) {
			const nestedField = field.fields?.[key];
			mergedDefaults[key] = nestedField ? createBuilderFieldDefault(nestedField, value) : cloneValue(value);
		}

		return mergedDefaults;
	}

	if (kind === 'array') {
		if (!Array.isArray(defaultValue)) {
			return [];
		}

		return defaultValue.map((entry) =>
			field.item ? createBuilderFieldDefault(field.item, entry) : cloneValue(entry)
		);
	}

	return cloneValue(defaultValue ?? getPrimitiveDefault(kind));
}

function findPreviewImageField(
	field: BuilderField,
	basePath = ''
): { path: string; previewSelector?: string; hasPreviewBinding: boolean } | null {
	const kind = inferBuilderFieldKind(field);

	if (kind === 'image') {
		return {
			path: basePath,
			previewSelector: getFieldPreviewSelector(field, basePath),
			hasPreviewBinding: Boolean(field.previewSelector || field.previewInMarkup)
		};
	}

	if (kind === 'object' && field.fields) {
		for (const [name, nestedField] of Object.entries(field.fields)) {
			const nestedPath = basePath ? `${basePath}.${name}` : name;
			const result = findPreviewImageField(nestedField, nestedPath);
			if (result) {
				return result;
			}
		}
	}

	return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getPrimitiveDefault(kind: BuilderFieldKind): unknown {
	if (kind === 'boolean') {
		return false;
	}

	if (kind === 'number') {
		return 0;
	}

	return '';
}

function parsePath(path: string): Array<string | number> {
	const segments: Array<string | number> = [];

	for (const part of path.split('.')) {
		const matches = part.match(/([^\[\]]+)|\[(\d+)\]/g) ?? [];

		for (const match of matches) {
			if (match.startsWith('[') && match.endsWith(']')) {
				segments.push(Number(match.slice(1, -1)));
				continue;
			}

			segments.push(match);
		}
	}

	return segments;
}

function asString(value: unknown): string {
	return typeof value === 'string' ? value : '';
}

function getFieldPreviewSelector(field: BuilderField, path: string): string | undefined {
	return field.previewSelector ?? (field.previewInMarkup ? inferFieldPreviewSelector(field, path) : undefined);
}

function inferFieldPreviewSelector(field: BuilderField, path: string): string | undefined {
	const kind = inferBuilderFieldKind(field);

	if (
		kind === 'text' ||
		kind === 'image' ||
		kind === 'richtext-inline' ||
		kind === 'richtext-block'
	) {
		return `[data-builder-field="${path}"]`;
	}

	return undefined;
}

function getCollectionPreviewSelector(path: string): string {
	return `[data-builder-collection-item="${path}"]`;
}

function inferSummaryField(field: BuilderField | undefined): string | undefined {
	if (!field?.fields) {
		return undefined;
	}

	for (const candidate of ['title', 'name', 'label', 'alt']) {
		if (field.fields[candidate]) {
			return candidate;
		}
	}

	return Object.entries(field.fields).find(([, nestedField]) => {
		const kind = inferBuilderFieldKind(nestedField);
		return kind === 'text' || kind === 'richtext-inline' || kind === 'richtext-block';
	})?.[0];
}

function humanizeKey(value: string): string {
	return value
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.replace(/[-_]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.replace(/^\w/, (match) => match.toUpperCase());
}

function createId(): string {
	if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
		return crypto.randomUUID();
	}

	return `block-${Math.random().toString(36).slice(2, 10)}`;
}
