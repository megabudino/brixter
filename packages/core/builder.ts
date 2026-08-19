/**
 * The document model the visual editor works against.
 *
 * A page on disk is a `.md` file (see `page/`); a brik is a `.brix` template
 * whose schema is inferred from its markup (see `schema/`). This module sits
 * between them: it turns a schema into the things an editor needs — a field
 * list, the collections it can add to and reorder, the placeholder content a
 * preview shows before anything is written — and provides the prop-manipulation
 * primitives that editing a page consists of.
 *
 * Nothing here is needed to *render* a site. The published build only calls
 * `renderBrikSource`; everything below exists for the authoring layer.
 */

import { PAGE_KEYS, type PageBrik, type PageDocument } from './page/index.js';
import { humanizeKey } from './schema/labels.js';
import type { BrikSchema, PropSchema, PropType } from './schema/types.js';
import type { TemplateNode } from './template/parser.js';
import { COLLECTION_ATTR, FIELD_ATTR } from './template/render.js';

/** A brik as the editor knows it: its name, where it lives, what it accepts. */
export interface BuilderDefinition {
	/** The brik's name — its file basename (`Hero`). */
	type: string;
	/** Import path or file path the loader resolved it from. */
	path: string;
	schema: BrikSchema;
	/** Parsed template, when the caller kept it for rendering. */
	nodes?: TemplateNode[] | null;
}

/** One section of a page, with a stable id for editor-side identity. */
export interface BuilderBlock {
	id: string;
	type: string;
	props: Record<string, unknown>;
}

export interface BuilderDocument {
	metadata: Record<string, unknown>;
	layout?: string;
	aliases?: unknown;
	sitemap?: unknown;
	body: string;
	blocks: BuilderBlock[];
}

/** A repeatable list inside a brik's props, as offered by the editor. */
export interface BuilderCollection {
	/** Canonical path, `plans` or `plans[].tiers`. */
	path: string;
	label: string;
	itemLabel: string;
	/** A fresh entry, built from the item schema's defaults. */
	defaultItem: unknown;
	summaryField?: string;
	imageField?: string;
	/** CSS selector matching one rendered entry. */
	previewSelector: string;
}

/** A prop the editor can edit directly on the rendered preview. */
export interface BuilderPreviewBinding {
	path: string;
	type: PropType;
	label: string;
	/** CSS selector matching the element the renderer anchored. */
	selector: string;
}

// ---------------------------------------------------------------------------
// Page metadata
// ---------------------------------------------------------------------------

/**
 * The `metadata` block's own schema — what the page inspector offers, and what
 * `<BrixSeo>` renders into `<head>`. Authors may add keys beyond these; they
 * reach the layout untouched.
 */
export const PAGE_METADATA_SCHEMA: Record<string, PropSchema> = {
	title: { type: 'string', label: 'Page title' },
	description: { type: 'string', label: 'Description' },
	canonical: { type: 'url', label: 'Canonical URL' },
	robots: {
		type: 'enum',
		label: 'Robots',
		default: 'index,follow',
		options: ['index,follow', 'noindex', 'nofollow', 'noindex,nofollow']
	},
	og: {
		type: 'object',
		label: 'Open Graph',
		fields: {
			title: { type: 'string', label: 'og:title' },
			description: { type: 'string', label: 'og:description' },
			image: { type: 'image', label: 'og:image' },
			url: { type: 'url', label: 'og:url' },
			type: {
				type: 'enum',
				label: 'og:type',
				default: 'website',
				options: ['website', 'article', 'product', 'profile']
			}
		}
	},
	twitter: {
		type: 'object',
		label: 'Twitter',
		fields: {
			card: {
				type: 'enum',
				label: 'twitter:card',
				default: 'summary_large_image',
				options: ['summary', 'summary_large_image', 'app', 'player']
			},
			title: { type: 'string', label: 'twitter:title' },
			description: { type: 'string', label: 'twitter:description' },
			image: { type: 'image', label: 'twitter:image' }
		}
	},
	jsonLd: { type: 'json', label: 'JSON-LD (structured data)' }
};

/** Page-level keys that are not metadata. Re-exported for the editor's UI. */
export { PAGE_KEYS };

// ---------------------------------------------------------------------------
// Documents and blocks
// ---------------------------------------------------------------------------

/** Give a parsed page the editor-side identity it needs (per-block ids). */
export function documentFromPage(page: PageDocument): BuilderDocument {
	return {
		metadata: page.metadata,
		layout: page.layout,
		aliases: page.aliases,
		sitemap: page.sitemap,
		body: page.body,
		blocks: page.brix.map((brik) => ({
			id: createId(),
			type: brik.type,
			props: ensureItemIds(brik.props) as Record<string, unknown>
		}))
	};
}

/** Drop the editor-only identity again, ready to serialize. */
export function pageFromDocument(document: BuilderDocument): PageDocument {
	return {
		metadata: document.metadata,
		layout: document.layout,
		aliases: document.aliases,
		sitemap: document.sitemap,
		body: document.body,
		brix: document.blocks.map(
			(block): PageBrik => ({
				type: block.type,
				props: stripItemIds(block.props) as Record<string, unknown>
			})
		)
	};
}

export function getDefinition(type: string, definitions: BuilderDefinition[]): BuilderDefinition {
	const definition = definitions.find((entry) => entry.type === type);
	if (!definition) throw new Error(`Unknown brik type: ${type}`);
	return definition;
}

/** A new block, its props empty so the template's own `??` values show through. */
export function createBlock(type: string, definitions: BuilderDefinition[]): BuilderBlock {
	return { id: createId(), type: getDefinition(type, definitions).type, props: {} };
}

// ---------------------------------------------------------------------------
// Placeholder content
// ---------------------------------------------------------------------------

/**
 * How many entries a collection with no data shows in the preview.
 *
 * A grid that renders one card reads as broken rather than as empty, so an
 * unpopulated collection is shown as a short list of identical placeholders —
 * enough for the layout to look like itself while the author fills it in.
 */
const FALLBACK_COLLECTION_ITEMS = 3;

export interface FallbackOptions {
	/**
	 * When `false`, text-ish props are left empty rather than filled with their
	 * `??` placeholder. Structural fallbacks (collections, images, icons) are
	 * kept so the layout stays visible. The editing canvas uses this so a field
	 * the author cleared stays cleared and shows its own placeholder chrome.
	 */
	contentFallback?: boolean;
}

/**
 * Fill in whatever the page did not supply, so a preview always has something
 * to show.
 *
 * The values come from the template's own `??` fallbacks — the same ones the
 * renderer applies — which is why briks no longer carry a `defaults:` block. A
 * collection is the one case that needs synthesising rather than reading: there
 * is no array literal anywhere, so entries are built from the item schema.
 */
export function createFallbackProps(
	schema: BrikSchema,
	props: Record<string, unknown> = {},
	options: FallbackOptions = {}
): Record<string, unknown> {
	return mergeFallback(fallbackFields(schema.props, options), props) as Record<string, unknown>;
}

function fallbackFields(
	fields: Record<string, PropSchema>,
	options: FallbackOptions
): Record<string, unknown> {
	return Object.fromEntries(
		Object.entries(fields).map(([key, field]) => [key, fallbackValue(field, key, options)])
	);
}

function fallbackValue(field: PropSchema, key: string, options: FallbackOptions): unknown {
	const contentFallback = options.contentFallback ?? true;

	if (field.type === 'object') {
		return field.fields ? fallbackFields(field.fields, options) : {};
	}

	if (field.type === 'array') {
		const item = field.items ? fallbackValue(field.items, field.itemLabel ?? key, options) : {};
		// Deterministic ids: this list is recomputed on every render for a
		// collection with no data, and per-render random ids would make a keyed
		// `{#each}` remount its entries continuously.
		return Array.from({ length: FALLBACK_COLLECTION_ITEMS }, (_, index) =>
			withFallbackItemId(clone(item), index)
		);
	}

	if (field.default !== undefined && field.default !== null) return field.default;
	if (field.type === 'enum') return field.options?.[0] ?? '';
	if (field.type === 'boolean') return false;
	if (field.type === 'number') return 0;
	if (field.type === 'image') return IMAGE_FALLBACK_DATA_URL;
	if (field.type === 'icon') return ICON_FALLBACK_SVG;
	if (field.type === 'json') return {};

	if (!contentFallback) return '';
	return field.label || humanizeKey(key);
}

function mergeFallback(fallback: unknown, value: unknown): unknown {
	if (!isRenderable(value)) return fallback;

	if (Array.isArray(value)) {
		// Merge item fallbacks into each entry so an empty field inside a
		// collection entry still gets its placeholder, exactly as a top-level
		// field does. The fallback array is a template: reuse its first entry for
		// anything beyond its length.
		if (Array.isArray(fallback) && fallback.length > 0) {
			return value.map((item, index) => mergeFallback(fallback[index] ?? fallback[0], item));
		}
		return value;
	}

	if (isRecord(value) && isRecord(fallback)) {
		return {
			...value,
			...Object.fromEntries(
				Object.entries(fallback).map(([key, entry]) => [key, mergeFallback(entry, value[key])])
			)
		};
	}

	return value;
}

function isRenderable(value: unknown): boolean {
	if (Array.isArray(value)) return value.length > 0;
	if (typeof value === 'string') return value.trim().length > 0;
	return value !== null && value !== undefined;
}

// ---------------------------------------------------------------------------
// Derived editor views of a schema
// ---------------------------------------------------------------------------

/** Every editable prop, flattened, with the selector that finds it on screen. */
export function previewBindingsFromSchema(
	fields: Record<string, PropSchema>,
	basePath = ''
): BuilderPreviewBinding[] {
	const bindings: BuilderPreviewBinding[] = [];

	for (const [key, field] of Object.entries(fields)) {
		const path = basePath ? `${basePath}.${key}` : key;

		if (field.type === 'object') {
			bindings.push(...previewBindingsFromSchema(field.fields ?? {}, path));
			continue;
		}

		if (field.type === 'array') {
			if (field.items?.type === 'object') {
				bindings.push(...previewBindingsFromSchema(field.items.fields ?? {}, `${path}[]`));
			}
			continue;
		}

		bindings.push({ path, type: field.type, label: field.label, selector: fieldSelector(path) });
	}

	return bindings;
}

/** Every collection the editor can add to, reorder, or delete from. */
export function collectionsFromSchema(
	fields: Record<string, PropSchema>,
	basePath = ''
): BuilderCollection[] {
	const collections: BuilderCollection[] = [];

	for (const [key, field] of Object.entries(fields)) {
		const path = basePath ? `${basePath}.${key}` : key;

		if (field.type === 'array') {
			collections.push({
				path,
				label: field.label,
				itemLabel: field.itemLabel ?? humanizeKey(key),
				defaultItem: field.items ? defaultsOf(field.items) : {},
				summaryField: field.summaryField,
				imageField: field.imageField,
				previewSelector: collectionSelector(path)
			});
			if (field.items?.type === 'object') {
				collections.push(...collectionsFromSchema(field.items.fields ?? {}, `${path}[]`));
			}
			continue;
		}

		if (field.type === 'object') {
			collections.push(...collectionsFromSchema(field.fields ?? {}, path));
		}
	}

	return collections;
}

/** The values a fresh instance of a prop starts with. */
export function defaultsOf(field: PropSchema): unknown {
	if (field.type === 'object') {
		return Object.fromEntries(
			Object.entries(field.fields ?? {}).map(([key, child]) => [key, defaultsOf(child)])
		);
	}
	if (field.type === 'array') return [];
	if (field.default !== undefined) return field.default;
	if (field.type === 'boolean') return false;
	if (field.type === 'number') return 0;
	if (field.type === 'enum') return field.options?.[0] ?? '';
	return '';
}

/** Selector matching the element the renderer anchored for a prop. */
export function fieldSelector(path: string): string {
	return `[${FIELD_ATTR}="${path}"]`;
}

/** Selector matching one rendered entry of a collection. */
export function collectionSelector(path: string): string {
	return `[${COLLECTION_ATTR}="${path}"]`;
}

// ---------------------------------------------------------------------------
// Prop manipulation
// ---------------------------------------------------------------------------

/** `plans[1].name` → `['plans', 1, 'name']`. */
export function parsePath(path: string): Array<string | number> {
	const segments: Array<string | number> = [];
	for (const part of path.split('.')) {
		if (!part) continue;
		const bracket = part.indexOf('[');
		if (bracket === -1) {
			segments.push(part);
			continue;
		}
		const head = part.slice(0, bracket);
		if (head) segments.push(head);
		for (const match of part.slice(bracket).matchAll(/\[(\d+)\]/g)) {
			segments.push(Number(match[1]));
		}
	}
	return segments;
}

export function getValueAtPath(props: Record<string, unknown>, path: string): unknown {
	let current: unknown = props;
	for (const segment of parsePath(path)) {
		if (typeof segment === 'number') {
			if (!Array.isArray(current)) return undefined;
			current = current[segment];
			continue;
		}
		if (!isRecord(current)) return undefined;
		current = current[segment];
	}
	return current;
}

/** Set a value at a path, creating intermediate containers, without mutating. */
export function updatePropsAtPath(
	props: Record<string, unknown>,
	path: string,
	value: unknown
): Record<string, unknown> {
	const segments = parsePath(path);
	if (segments.length === 0) throw new Error('Invalid path.');

	const result = clone(props);
	let current: unknown = result;

	for (let index = 0; index < segments.length - 1; index += 1) {
		const segment = segments[index];
		const next = segments[index + 1];
		const container = typeof next === 'number' ? [] : {};

		if (typeof segment === 'number') {
			if (!Array.isArray(current)) throw new Error(`Segment \`${segment}\` requires a list.`);
			current[segment] ??= container;
			current = current[segment];
			continue;
		}

		if (!isRecord(current)) throw new Error(`Segment \`${segment}\` requires a mapping.`);
		current[segment] ??= container;
		current = current[segment];
	}

	const last = segments[segments.length - 1];
	if (typeof last === 'number') {
		if (!Array.isArray(current)) throw new Error(`Segment \`${last}\` requires a list.`);
		current[last] = value;
		return result;
	}

	if (!isRecord(current)) throw new Error(`Segment \`${last}\` requires a mapping.`);
	current[last] = value;
	return result;
}

export function getCollectionItems(
	props: Record<string, unknown>,
	collection: BuilderCollection
): unknown[] {
	const value = getValueAtPath(props, collection.path);
	return Array.isArray(value) ? value : [];
}

export function addCollectionItem(
	props: Record<string, unknown>,
	collection: BuilderCollection
): Record<string, unknown> {
	return updatePropsAtPath(props, collection.path, [
		...getCollectionItems(props, collection),
		assignItemId(clone(collection.defaultItem))
	]);
}

export function removeCollectionItem(
	props: Record<string, unknown>,
	collection: BuilderCollection,
	index: number
): Record<string, unknown> {
	const items = getCollectionItems(props, collection);
	if (index < 0 || index >= items.length) return props;
	return updatePropsAtPath(
		props,
		collection.path,
		items.filter((_, position) => position !== index)
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
	const outOfRange = (index: number) => index < 0 || index >= items.length;
	if (outOfRange(fromIndex) || outOfRange(toIndex) || fromIndex === toIndex) return props;

	const [item] = items.splice(fromIndex, 1);
	items.splice(toIndex, 0, item);
	return updatePropsAtPath(props, collection.path, items);
}

/** What to call one entry in the editor's list. */
export function getCollectionItemSummary(
	item: unknown,
	collection: BuilderCollection,
	index: number
): string {
	if (collection.summaryField && isRecord(item)) {
		const summary = getValueAtPath(item, collection.summaryField);
		if (typeof summary === 'string' && summary.trim()) return summary;
	}
	return `${collection.itemLabel} ${index + 1}`;
}

export function getCollectionItemImagePath(
	collection: BuilderCollection,
	index: number
): string | null {
	if (!collection.imageField) return null;
	return `${collection.path}[${index}].${collection.imageField}`;
}

// ---------------------------------------------------------------------------
// Item identity
// ---------------------------------------------------------------------------

/**
 * Stable identity attached to every collection entry so a keyed `{#each}` can
 * key on identity rather than position. Without it, reordering reuses DOM nodes
 * positionally, which leaves imperatively mounted inline editors bound to the
 * wrong entry — content appears to jump to a neighbour. Kept in editor props,
 * stripped from anything written back to disk.
 */
export const BUILDER_ITEM_ID_KEY = '_bxid';

function assignItemId(item: unknown): unknown {
	if (!isRecord(item)) return item;
	return { ...item, [BUILDER_ITEM_ID_KEY]: createId() };
}

/** Stable per-position id for transient placeholder entries. */
function withFallbackItemId(item: unknown, index: number): unknown {
	if (!isRecord(item)) return item;
	return { ...item, [BUILDER_ITEM_ID_KEY]: `fallback-${index}` };
}

/** Add ids where they are missing, leaving existing ones in place. */
export function ensureItemIds(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map((entry) =>
			isRecord(entry) && !entry[BUILDER_ITEM_ID_KEY]
				? assignItemId(ensureItemIds(entry))
				: ensureItemIds(entry)
		);
	}
	if (!isRecord(value)) return value;
	return Object.fromEntries(
		Object.entries(value).map(([key, entry]) => [key, ensureItemIds(entry)])
	);
}

/** Remove the internal id again so serialized output stays clean. */
export function stripItemIds(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(stripItemIds);
	if (!isRecord(value)) return value;
	return Object.fromEntries(
		Object.entries(value)
			.filter(([key]) => key !== BUILDER_ITEM_ID_KEY)
			.map(([key, entry]) => [key, stripItemIds(entry)])
	);
}

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

/** `hero-banner` / `hero_banner` / `Hero.brix` → `HeroBanner` / `Hero`. */
export function toComponentName(value: string): string {
	const normalized = value.trim().replace(/\.(brix|svelte|ts|js)$/i, '');
	if (/^[A-Z][A-Za-z0-9]*$/.test(normalized)) return normalized;
	return normalized
		.split(/[-_\s/]+/)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join('');
}

const IMAGE_FALLBACK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 240" role="img" aria-hidden="true">
	<rect width="320" height="240" fill="#e5e7eb" />
	<path d="M0 200l90-70 60 46 55-40 115 84z" fill="#cbd5f5" />
	<circle cx="86" cy="72" r="26" fill="#cbd5f5" />
</svg>`;

const IMAGE_FALLBACK_DATA_URL = `data:image/svg+xml,${encodeURIComponent(IMAGE_FALLBACK_SVG)}`;

const ICON_FALLBACK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-help-circle"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>`;

function createId(): string {
	if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
	return `bx-${Math.random().toString(36).slice(2, 10)}`;
}

function clone<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
