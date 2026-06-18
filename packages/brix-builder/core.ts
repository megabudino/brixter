import yaml from 'yaml';

const { parse: parseYaml, stringify: stringifyYaml } = yaml;

export type BuilderMode = 'component' | 'markdown';
export type BuilderBindingType = 'image' | 'richtext' | 'text' | 'icon';
export type BuilderFieldKind =
	| 'text'
	| 'boolean'
	| 'number'
	| 'object'
	| 'array'
	| 'image'
	| 'icon'
	| 'richtext-inline'
	| 'richtext-block'
	| 'select'
	| 'url'
	| 'textarea'
	| 'date'
	| 'color'
	| 'json';

export interface BuilderFieldOption {
	label?: string;
	value: string;
}

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
	options?: BuilderFieldOption[];
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

/**
 * Standard SEO/page metadata fields always available in the page inspector.
 *
 * `title` and `description` are routed to the top-level document fields; every
 * other key is stored under `document.metadata` and rendered into the page
 * `<head>` by the injected `BrixSeo` component (see the Vite plugin).
 */
export const STANDARD_SEO_FIELDS: BuilderFields = {
	title: { kind: 'text', label: 'Page Title' },
	description: { kind: 'textarea', label: 'Description' },
	canonical: { kind: 'url', label: 'Canonical URL' },
	robots: {
		kind: 'select',
		label: 'Robots',
		default: 'index,follow',
		options: [
			{ label: 'Index, follow', value: 'index,follow' },
			{ label: 'No index', value: 'noindex' },
			{ label: 'No follow', value: 'nofollow' },
			{ label: 'No index, no follow', value: 'noindex,nofollow' }
		]
	},
	og: {
		kind: 'object',
		label: 'Open Graph',
		fields: {
			title: { kind: 'text', label: 'og:title' },
			description: { kind: 'textarea', label: 'og:description' },
			image: { kind: 'image', label: 'og:image' },
			url: { kind: 'url', label: 'og:url' },
			type: {
				kind: 'select',
				label: 'og:type',
				default: 'website',
				options: [
					{ label: 'Website', value: 'website' },
					{ label: 'Article', value: 'article' },
					{ label: 'Product', value: 'product' },
					{ label: 'Profile', value: 'profile' }
				]
			}
		}
	},
	twitter: {
		kind: 'object',
		label: 'Twitter',
		fields: {
			card: {
				kind: 'select',
				label: 'twitter:card',
				default: 'summary_large_image',
				options: [
					{ label: 'Summary', value: 'summary' },
					{ label: 'Summary large image', value: 'summary_large_image' },
					{ label: 'App', value: 'app' },
					{ label: 'Player', value: 'player' }
				]
			},
			title: { kind: 'text', label: 'twitter:title' },
			description: { kind: 'textarea', label: 'twitter:description' },
			image: { kind: 'image', label: 'twitter:image' }
		}
	},
	jsonLd: { kind: 'json', label: 'JSON-LD (structured data)' }
};

export interface BuilderBlock {
	id: string;
	type: string;
	props: Record<string, unknown>;
}

export interface BuilderDocument {
	title: string;
	description: string;
	layout?: string;
	metadata?: Record<string, unknown>;
	blocks: BuilderBlock[];
}

export interface BrixYamlComponent {
	type: string;
	props?: Record<string, unknown>;
}

export interface BrixYamlDocument {
	title?: string;
	description?: string;
	layout?: string;
	components?: BrixYamlComponent[];
	[key: string]: unknown;
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

export function createBuilderFallbackProps(
	definition: Pick<BuilderDefinition, 'fields' | 'defaults'>,
	props: Record<string, unknown> = definition.defaults
): Record<string, unknown> {
	return mergeFallbackValues(
		createBuilderFallbackPropsFromFields(definition.fields),
		props
	) as Record<string, unknown>;
}

function createBuilderFallbackPropsFromFields(fields: BuilderFields): Record<string, unknown> {
	return Object.fromEntries(
		Object.entries(fields).map(([key, field]) => [key, createBuilderFallbackValue(field, key)])
	);
}

function createBuilderFallbackValue(field: BuilderField, key: string): unknown {
	const kind = inferBuilderFieldKind(field);

	if (kind === 'richtext-inline') {
		return createRichTextValue('inline', getFallbackText(key));
	}

	if (kind === 'richtext-block') {
		return createRichTextValue('block', `<p>${getFallbackText(key)}</p>`);
	}

	if (kind === 'object') {
		return field.fields ? createBuilderFallbackPropsFromFields(field.fields) : {};
	}

	if (kind === 'array') {
		const item = field.item ? createBuilderFallbackValue(field.item, field.itemLabel ?? key) : {};
		// Deterministic ids: this fallback array is recomputed on every render for
		// collections without persisted data, so per-render random ids would make
		// the keyed {#each} remount its items continuously.
		return [cloneValue(item), cloneValue(item), cloneValue(item)].map((entry, index) =>
			withFallbackItemId(entry, index)
		);
	}

	if (kind === 'boolean') {
		return true;
	}

	if (kind === 'number') {
		return 3;
	}

	if (kind === 'image') {
		return createImageFallback();
	}

	if (kind === 'icon') {
		return createIconFallback();
	}

	if (isHrefKey(key)) {
		return '#';
	}

	return getFallbackText(key);
}

function mergeFallbackValues(fallbackValue: unknown, value: unknown): unknown {
	if (!hasRenderableValue(value)) {
		return fallbackValue;
	}

	if (isRichTextValue(value)) {
		return value.html.trim() ? value : fallbackValue;
	}

	if (Array.isArray(value)) {
		return value.length > 0 ? value : fallbackValue;
	}

	if (isRecord(value) && isRecord(fallbackValue)) {
		return {
			...value,
			...Object.fromEntries(
				Object.entries(fallbackValue).map(([key, fallbackEntry]) => [
					key,
					mergeFallbackValues(fallbackEntry, value[key])
				])
			)
		};
	}

	return value;
}

function hasRenderableValue(value: unknown): boolean {
	if (isRichTextValue(value)) {
		return value.html.trim().length > 0;
	}

	if (Array.isArray(value)) {
		return value.length > 0;
	}

	if (typeof value === 'string') {
		return value.trim().length > 0;
	}

	return value !== null && value !== undefined;
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
				label:
					field.previewLabel ??
					(field.label ? `Sostituisci ${field.label.toLowerCase()}` : undefined)
			});
			continue;
		}

		if (kind === 'icon' && selector) {
			bindings.push({
				type: 'icon',
				selector,
				path,
				label: field.previewLabel ?? field.label
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
		(kind === 'text' ||
			kind === 'image' ||
			kind === 'icon' ||
			kind === 'richtext-inline' ||
			kind === 'richtext-block');

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
		metadata: {},
		blocks: initialBlocks.map((definition) => createBlock(definition.type, definitions))
	};
}

export function createBlock(type: string, definitions: BuilderDefinition[]): BuilderBlock {
	const definition = getDefinition(type, definitions);

	return {
		id: createId(),
		type: definition.type,
		props: cloneValue(createBuilderFallbackProps(definition))
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
	return updatePropsAtPath(props, collection.path, [
		...items,
		assignBuilderItemId(cloneValue(collection.defaultItem))
	]);
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
				`\tconst blockProps${index + 1} = ${JSON.stringify(stripBuilderItemIds(normalizeBuilderPropsForRender(block.props)), null, 2)};`
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

export function parseBrixYamlDocument(
	source: string,
	definitions: BuilderDefinition[]
): BuilderDocument {
	const parsed = parseYaml(source) as unknown;
	const rawDocument = isRecord(parsed) ? parsed : {};
	const components = Array.isArray(rawDocument.components) ? rawDocument.components : [];
	const metadata = getBrixYamlMetadata(rawDocument);
	const title = typeof rawDocument.title === 'string' ? rawDocument.title : 'Pagina Brixter';
	const description =
		typeof rawDocument.description === 'string'
			? rawDocument.description
			: 'Bozza generata da Brixter.';
	const layout =
		typeof rawDocument.layout === 'string' && rawDocument.layout.trim()
			? rawDocument.layout.trim()
			: undefined;
	const blocks: BuilderBlock[] = [];

	for (const component of components) {
		if (!isRecord(component) || typeof component.type !== 'string') {
			continue;
		}

		const definition = findDefinitionForBrixType(component.type, definitions);
		if (!definition || definition.mode !== 'component') {
			continue;
		}

		blocks.push({
			id: createId(),
			type: definition.type,
			props: hydrateBuilderProps(
				isRecord(component.props) ? component.props : {},
				definition.fields,
				definition.defaults
			)
		});
	}

	return {
		title,
		description,
		layout,
		metadata,
		blocks
	};
}

export function serializeToBrixYaml(
	document: BuilderDocument,
	definitions: BuilderDefinition[]
): string {
	const output: BrixYamlDocument = {
		title: document.title,
		description: document.description
	};

	for (const [key, value] of Object.entries(document.metadata ?? {})) {
		if (key === 'title' || key === 'description' || key === 'layout' || key === 'components') {
			continue;
		}
		output[key] = cloneValue(value);
	}

	if (document.layout) {
		output.layout = document.layout;
	}

	output.components = document.blocks
		.map((block) => ({ block, definition: getDefinition(block.type, definitions) }))
		.filter((entry) => entry.definition.mode === 'component')
		.map(({ block }) => ({
			type: block.type,
			props: stripBuilderItemIds(normalizeBuilderPropsForRender(block.props)) as Record<
				string,
				unknown
			>
		}));

	return stringifyYaml(output).trimEnd() + '\n';
}

function cloneValue<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Stable identity attached to every collection item so that {#each} blocks can
 * be keyed by item identity instead of position. Without it, reordering a
 * collection reuses DOM nodes/components positionally, which leaves imperatively
 * mounted inline editors (and stateful rich-text editors) bound to the wrong
 * item — content appears duplicated onto a neighbouring element. The id is kept
 * in editor/preview props but stripped from serialized output via
 * {@link stripBuilderItemIds}.
 */
export const BUILDER_ITEM_ID_KEY = '_bxid';

/** Always assigns a fresh id (used when creating brand new items). */
function assignBuilderItemId(item: unknown): unknown {
	if (!isRecord(item)) {
		return item;
	}
	return { ...item, [BUILDER_ITEM_ID_KEY]: createId() };
}

/** Stable per-position id for transient fallback/default items. */
function withFallbackItemId(item: unknown, index: number): unknown {
	if (!isRecord(item)) {
		return item;
	}
	return { ...item, [BUILDER_ITEM_ID_KEY]: `__bx-default-${index}` };
}

/** Assigns an id only when one is missing (used while hydrating existing data). */
function ensureBuilderItemId(item: unknown): unknown {
	if (!isRecord(item)) {
		return item;
	}
	const existing = item[BUILDER_ITEM_ID_KEY];
	if (typeof existing === 'string' && existing) {
		return item;
	}
	return { ...item, [BUILDER_ITEM_ID_KEY]: createId() };
}

/** Recursively removes the internal item id so serialized output stays clean. */
function stripBuilderItemIds(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map(stripBuilderItemIds);
	}
	if (isRecord(value)) {
		return Object.fromEntries(
			Object.entries(value)
				.filter(([key]) => key !== BUILDER_ITEM_ID_KEY)
				.map(([key, entry]) => [key, stripBuilderItemIds(entry)])
		);
	}
	return value;
}

function getBrixYamlMetadata(document: Record<string, unknown>): Record<string, unknown> {
	return Object.fromEntries(
		Object.entries(document)
			.filter(
				([key]) =>
					key !== 'title' && key !== 'description' && key !== 'layout' && key !== 'components'
			)
			.map(([key, value]) => [key, cloneValue(value)])
	);
}

function findDefinitionForBrixType(
	type: string,
	definitions: BuilderDefinition[]
): BuilderDefinition | undefined {
	const normalized = toComponentName(type);
	return definitions.find(
		(definition) => definition.type === type || definition.type === normalized
	);
}

export function toComponentName(value: string): string {
	const normalized = value.trim().replace(/\.(svelte|ts|js)$/i, '');
	if (/^[A-Z][A-Za-z0-9]*$/.test(normalized)) return normalized;
	return normalized
		.split(/[-_\s/]+/)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join('');
}

function hydrateBuilderProps(
	props: Record<string, unknown>,
	fields: BuilderFields,
	defaults: Record<string, unknown>
): Record<string, unknown> {
	const hydrated: Record<string, unknown> = cloneValue(defaults);

	for (const [key, value] of Object.entries(props)) {
		const field = fields[key];
		hydrated[key] = field ? hydrateBuilderValue(value, field, defaults[key]) : cloneValue(value);
	}

	return hydrated;
}

function hydrateBuilderValue(value: unknown, field: BuilderField, defaultValue: unknown): unknown {
	const kind = inferBuilderFieldKind(field);

	if (kind === 'richtext-inline' || kind === 'richtext-block') {
		if (isRichTextValue(value)) {
			return cloneValue(value);
		}
		return createRichTextValue(kind === 'richtext-inline' ? 'inline' : 'block', asString(value));
	}

	if (kind === 'object') {
		const nestedDefaults = isRecord(defaultValue)
			? defaultValue
			: field.fields
				? createBuilderDefaultsFromFields(field.fields)
				: {};
		if (!isRecord(value)) {
			return cloneValue(nestedDefaults);
		}
		return field.fields
			? hydrateBuilderProps(value, field.fields, nestedDefaults)
			: cloneValue(value);
	}

	if (kind === 'array') {
		if (!Array.isArray(value)) {
			return [];
		}
		return value.map((entry) =>
			ensureBuilderItemId(
				field.item ? hydrateBuilderValue(entry, field.item, undefined) : cloneValue(entry)
			)
		);
	}

	return cloneValue(value);
}

function createBuilderFieldDefault(field: BuilderField, defaultValue = field.default): unknown {
	const kind = inferBuilderFieldKind(field);

	if (kind === 'richtext-inline' || kind === 'richtext-block') {
		return createRichTextValue(
			kind === 'richtext-inline' ? 'inline' : 'block',
			asString(defaultValue)
		);
	}

	if (kind === 'object') {
		const nestedDefaults = field.fields ? createBuilderDefaultsFromFields(field.fields) : {};

		if (!isRecord(defaultValue)) {
			return nestedDefaults;
		}

		const mergedDefaults: Record<string, unknown> = { ...nestedDefaults };

		for (const [key, value] of Object.entries(defaultValue)) {
			const nestedField = field.fields?.[key];
			mergedDefaults[key] = nestedField
				? createBuilderFieldDefault(nestedField, value)
				: cloneValue(value);
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

	if (kind === 'select') {
		if (defaultValue !== undefined && defaultValue !== null) {
			return cloneValue(defaultValue);
		}
		return field.options?.[0]?.value ?? '';
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

	if (kind === 'json') {
		return null;
	}

	return '';
}

export function getFallbackText(key: string): string {
	const normalized = key.toLowerCase();

	if (normalized.includes('eyebrow')) return 'Launch smarter';
	if (normalized.includes('headline') || normalized.includes('title')) {
		return 'Build better pages faster';
	}
	if (
		normalized.includes('subtitle') ||
		normalized.includes('description') ||
		normalized.includes('text')
	) {
		return 'A focused preview with realistic content so you can recognize this brik.';
	}
	if (normalized.includes('label')) return 'Get started';
	if (normalized.includes('note')) return 'No setup required.';
	if (normalized.includes('author') || normalized.includes('name')) return 'Alex Morgan';
	if (normalized.includes('role')) return 'Product lead';
	if (normalized.includes('quote')) return 'This section gives the page structure immediately.';
	if (normalized.includes('claim')) return 'Simple pages, edited visually.';
	if (normalized.includes('brand')) return 'Brixter';

	return humanizeKey(key);
}

function isHrefKey(key: string): boolean {
	return key.toLowerCase() === 'href' || key.toLowerCase().endsWith('url');
}

function createImageFallback(): string {
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 240" role="img" aria-hidden="true">
	<g transform="translate(160 120)" stroke="#a3a3a3" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
		<g transform="translate(-12 -12)">
			<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
			<circle cx="9" cy="9" r="2"/>
			<path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
		</g>
	</g>
</svg>`;
	return `data:image/svg+xml,${encodeURIComponent(svg)}`;
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
	return (
		field.previewSelector ??
		(field.previewInMarkup ? inferFieldPreviewSelector(field, path) : undefined)
	);
}

function inferFieldPreviewSelector(field: BuilderField, path: string): string | undefined {
	const kind = inferBuilderFieldKind(field);

	if (
		kind === 'text' ||
		kind === 'image' ||
		kind === 'icon' ||
		kind === 'richtext-inline' ||
		kind === 'richtext-block'
	) {
		return `[data-brixter-field="${path}"]`;
	}

	return undefined;
}

function getCollectionPreviewSelector(path: string): string {
	return `[data-brixter-collection-item="${path}"]`;
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

function createIconFallback(): string {
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-help-circle"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>`;
}

export function getFieldByRawPath(fields: BuilderFields, rawPath: string): BuilderField | null {
	const segments = rawPath.split('.');
	let currentFields: BuilderFields | undefined = fields;
	let currentField: BuilderField | null = null;

	for (const segment of segments) {
		if (!currentFields) {
			return null;
		}

		const isArray = segment.endsWith('[]');
		const name = isArray ? segment.slice(0, -2) : segment;
		const field: BuilderField | undefined = currentFields[name];

		if (!field) {
			return null;
		}

		currentField = field;

		if (isArray && field.item?.fields) {
			currentFields = field.item.fields;
		} else if (field.fields) {
			currentFields = field.fields;
		} else {
			currentFields = undefined;
		}
	}

	return currentField;
}

export function getFieldByPath(fields: BuilderFields, path: string): BuilderField | null {
	const rawPath = path.replace(/\[\d+\]/g, '[]');
	return getFieldByRawPath(fields, rawPath);
}
