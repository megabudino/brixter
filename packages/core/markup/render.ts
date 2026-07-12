/**
 * Runtime interpreter for plain `.brix` markup.
 *
 * Renders an annotated template (see `parser.ts`) against a set of props into an
 * HTML string. This replaces the build-time Svelte preprocessor: the same
 * substitution rules that `svelte/preprocess.ts` emits as Svelte expressions are
 * applied here directly at runtime —
 *
 *   - `data-brixter-field`        → element content (text, or raw HTML for
 *                                   richtext/icon kinds; `src` for <img>)
 *   - `data-brixter-collection-item="items"` → repeat the element per array entry,
 *                                   resolving `items[].x` against each entry
 *   - `data-brixter-bind="attr:path; ..."`   → write resolved values onto attributes
 *     (`attr: path` replaces the whole attribute; `style.<prop>: path` merges a
 *     single CSS declaration into the existing `style` — see `bindings.ts`)
 *
 * Props are expected in render-shape (richtext already flattened to HTML strings
 * by `normalizeBuilderPropsForRender`). All `data-brixter-*` attributes are
 * preserved in the output so the editor's DOM-driven interaction layer keeps
 * working. The resulting string is consumed via Svelte `{@html}` in the editor
 * wrapper and during SSR of published pages.
 */

import {
	isVoidElement,
	parseTemplate,
	type ElementNode,
	type TemplateAttribute,
	type TemplateNode
} from './parser.js';
import {
	mergeStyleDeclaration,
	parseBindings,
	parseStyleDeclarations,
	sanitizeStyleValue,
	serializeStyleDeclarations
} from './bindings.js';

const FIELD_ATTR = 'data-brixter-field';
const KIND_ATTR = 'data-brixter-kind';
const COLLECTION_ATTR = 'data-brixter-collection-item';
const BIND_ATTR = 'data-brixter-bind';

const RAW_HTML_KINDS = new Set(['richtext-inline', 'richtext-block', 'icon']);

type Props = Record<string, unknown>;

interface RenderContext {
	props: Props;
	/** Active collection item values keyed by collection name, for `items[].x`. */
	itemScopes: Record<string, unknown>;
}

/** Parse + render a template body in one call. Prefer caching the parsed AST and using `render`. */
export function renderToString(template: string, props: Props): string {
	return render(parseTemplate(template), props);
}

const FRONTMATTER_PATTERN = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;

/** Drop a leading `---` YAML frontmatter block, leaving the markup body. */
export function stripFrontmatter(source: string): string {
	return source.replace(FRONTMATTER_PATTERN, '');
}

/**
 * Render a full `.brix` file source (frontmatter + body). Used at build/SSR
 * time where the raw file is imported with `?raw`. Frontmatter metadata is not
 * needed for rendering — only the body is interpreted.
 */
export function renderBrixSource(source: string, props: Props): string {
	return renderToString(stripFrontmatter(source), props);
}

export function render(nodes: TemplateNode[], props: Props): string {
	const ctx: RenderContext = { props: props ?? {}, itemScopes: {} };
	return renderNodes(nodes, ctx);
}

function renderNodes(nodes: TemplateNode[], ctx: RenderContext): string {
	let out = '';
	for (const node of nodes) {
		out += renderNode(node, ctx);
	}
	return out;
}

function renderNode(node: TemplateNode, ctx: RenderContext): string {
	if (node.type === 'text') {
		return escapeText(node.value);
	}
	if (node.type === 'comment') {
		return `<!--${node.value}-->`;
	}
	return renderElement(node, ctx);
}

function renderElement(el: ElementNode, ctx: RenderContext): string {
	const collectionName = getAttr(el, COLLECTION_ATTR);

	// Collection item container → repeat once per array entry.
	if (collectionName) {
		const items = asArray(getByPath(ctx.props, collectionName));
		let out = '';
		for (const item of items) {
			const itemCtx: RenderContext = {
				props: ctx.props,
				itemScopes: { ...ctx.itemScopes, [collectionName]: item }
			};
			out += renderSingleElement(el, itemCtx);
		}
		return out;
	}

	return renderSingleElement(el, ctx);
}

function renderSingleElement(el: ElementNode, ctx: RenderContext): string {
	const attributes = el.attributes.map((attr) => ({ ...attr }));
	const fieldPath = getAttr(el, FIELD_ATTR);
	const kind = getAttr(el, KIND_ATTR) ?? (isImg(el) ? 'image' : 'text');

	let innerHtml: string | null = null;
	let dropChildren = false;

	if (fieldPath) {
		const value = resolveValue(fieldPath, ctx);
		if (isImg(el) && kind === 'image') {
			setAttribute(attributes, 'src', stringifyValue(value));
			dropChildren = true;
		} else if (RAW_HTML_KINDS.has(kind)) {
			innerHtml = value == null ? '' : String(value);
		} else {
			innerHtml = escapeText(stringifyValue(value));
		}
	}

	// data-brixter-bind wiring (independent of data-brixter-field).
	const bind = getAttr(el, BIND_ATTR);
	if (bind) {
		applyBindings(attributes, bind, ctx);
	}

	const open = `<${el.name}${serializeAttributes(attributes)}`;

	if (isVoidElement(el.name)) {
		return `${open}>`;
	}

	let children: string;
	if (innerHtml !== null) {
		children = innerHtml;
	} else if (dropChildren) {
		children = '';
	} else {
		children = renderNodes(el.children, ctx);
	}

	return `${open}>${children}</${el.name}>`;
}

// ---------------------------------------------------------------------------
// Path / value resolution
// ---------------------------------------------------------------------------

function resolveValue(path: string, ctx: RenderContext): unknown {
	const idx = path.indexOf('[]');
	if (idx === -1) {
		return getByPath(ctx.props, path);
	}

	const collectionName = path.slice(0, idx);
	const rest = stripLeadingDot(path.slice(idx + 2));
	const item = ctx.itemScopes[collectionName];

	if (item !== undefined) {
		return rest ? getByPath(item, rest) : item;
	}

	// Outside a collection scope, fall back to the first entry (mirrors the
	// preprocessor's `[0]` fallback) so the value still resolves.
	const arr = asArray(getByPath(ctx.props, collectionName));
	const first = arr[0];
	return rest ? getByPath(first, rest) : first;
}

function getByPath(source: unknown, path: string): unknown {
	if (!path) return source;
	let current: unknown = source;
	for (const segment of path.split('.')) {
		if (current == null || typeof current !== 'object') {
			return undefined;
		}
		current = (current as Record<string, unknown>)[segment];
	}
	return current;
}

function stripLeadingDot(value: string): string {
	return value.startsWith('.') ? value.slice(1) : value;
}

function asArray(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}

function stringifyValue(value: unknown): string {
	if (value == null) return '';
	if (typeof value === 'string') return value;
	return String(value);
}

// ---------------------------------------------------------------------------
// Attributes
// ---------------------------------------------------------------------------

function getAttr(el: ElementNode, name: string): string | undefined {
	const attr = el.attributes.find((entry) => entry.name === name);
	return attr?.value ?? undefined;
}

function isImg(el: ElementNode): boolean {
	return el.name.toLowerCase() === 'img';
}

function getAttrValue(attributes: TemplateAttribute[], name: string): string | undefined {
	const existing = attributes.find((attr) => attr.name === name);
	return existing?.value ?? undefined;
}

function setAttribute(attributes: TemplateAttribute[], name: string, value: string): void {
	const existing = attributes.find((attr) => attr.name === name);
	if (existing) {
		existing.value = value;
	} else {
		attributes.push({ name, value });
	}
}

function serializeAttributes(attributes: TemplateAttribute[]): string {
	let out = '';
	for (const attr of attributes) {
		if (attr.value === null) {
			out += ` ${attr.name}`;
		} else {
			out += ` ${attr.name}="${escapeAttribute(attr.value)}"`;
		}
	}
	return out;
}

// ---------------------------------------------------------------------------
// data-brixter-bind wiring
//
// The grammar lives in `bindings.ts` so every layer that reads it (this
// runtime interpreter, plus any build-time preprocessor / editor field
// inference) stays in lock-step.
// ---------------------------------------------------------------------------

function applyBindings(attributes: TemplateAttribute[], bind: string, ctx: RenderContext): void {
	// `style.<prop>` merges are deferred until after every plain `attr` write so
	// that a whole-attribute `style: path` replace happens FIRST and the
	// per-property merges compose onto its result (documented order).
	const styleMerges: Array<{ prop: string; value: string }> = [];

	for (const binding of parseBindings(bind)) {
		if (binding.kind === 'attr') {
			setAttribute(attributes, binding.attr, stringifyValue(resolveValue(binding.path, ctx)));
			continue;
		}
		styleMerges.push({
			prop: binding.prop,
			value: stringifyValue(resolveValue(binding.path, ctx))
		});
	}

	if (styleMerges.length === 0) return;

	const declarations = parseStyleDeclarations(getAttrValue(attributes, 'style') ?? '');
	for (const { prop, value } of styleMerges) {
		// null/empty resolved value → do not emit the declaration and do not
		// remove a static one already present: the markup default stands.
		if (value === '') continue;
		mergeStyleDeclaration(declarations, prop, sanitizeStyleValue(value));
	}

	const serialized = serializeStyleDeclarations(declarations);
	if (serialized) {
		setAttribute(attributes, 'style', serialized);
	}
}

// ---------------------------------------------------------------------------
// Escaping
// ---------------------------------------------------------------------------

function escapeText(value: string): string {
	return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttribute(value: string): string {
	return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}
