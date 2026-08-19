/**
 * Runtime interpreter for `.brix` templates.
 *
 * Renders a parsed template against a set of props into an HTML string. It is
 * the only consumer of the AST that needs actual values; everything else in
 * `template/` works statically.
 *
 * Two behaviours are worth knowing before reading the code:
 *
 * **`??` covers both roles.** A `{headline ?? 'Ship pages'}` fallback is the
 * value used when the page omits the prop *and* the placeholder the editor
 * shows before content exists. Absent means null, undefined, or empty string —
 * an emptied field falls back to its placeholder rather than rendering a hole.
 *
 * **Editor anchors are emitted, not authored.** The visual editor binds
 * click-to-edit to `[data-brixter-field]` / `[data-brixter-collection-item]` in
 * the rendered DOM. The template no longer carries those attributes, so the
 * renderer adds them where they are unambiguous: an element whose entire
 * content is one interpolation, and the sole element inside an `{#each}`. Pass
 * `editorAnchors: false` to leave them out of a production build.
 */

import { splitFrontmatter } from '../frontmatter.js';
import { joinStyleChunks, sanitizeStyleValue, type StyleChunk } from './style.js';
import type { Condition, LiteralValue, Reference } from './expression.js';
import {
	isVoidElement,
	parseTemplate,
	type AttributePart,
	type ElementNode,
	type TemplateAttribute,
	type TemplateNode
} from './parser.js';

export const FIELD_ATTR = 'data-brixter-field';
export const KIND_ATTR = 'data-brixter-kind';
export const COLLECTION_ATTR = 'data-brixter-collection-item';

/** Tags whose value is written into the page as raw HTML. */
const RAW_HTML_TAGS = new Set(['richtext', 'icon']);

type Props = Record<string, unknown>;

export interface RenderOptions {
	/**
	 * Emit `data-brixter-*` anchors for the visual editor.
	 *
	 * @default true
	 */
	editorAnchors?: boolean;
}

interface RenderContext {
	props: Props;
	/** `{#each … as x}` bindings: alias → current item. */
	scope: Map<string, unknown>;
	/** `{#each … , i}` bindings: alias → current index. */
	indices: Map<string, number>;
	anchors: boolean;
}

/** Parse and render in one call. Prefer caching the AST and using {@link render}. */
export function renderToString(template: string, props: Props, options?: RenderOptions): string {
	return render(parseTemplate(template), props, options);
}

/**
 * Parsed templates, keyed by the source they came from.
 *
 * A compiled page imports its briks with `?raw` and hands the same string to
 * {@link renderBrikSource} on every render, so without this every SSR request
 * would re-parse identical markup. A site has a bounded number of briks, so the
 * map is bounded too.
 */
const parsedSources = new Map<string, TemplateNode[]>();

/**
 * Render a whole `.brix` file (frontmatter + template). Used at build/SSR time
 * where the raw file is imported with `?raw`; the frontmatter carries the
 * brik's own title and description and is not needed to render.
 */
export function renderBrikSource(source: string, props: Props, options?: RenderOptions): string {
	let nodes = parsedSources.get(source);
	if (!nodes) {
		nodes = parseTemplate(splitFrontmatter(source).body);
		parsedSources.set(source, nodes);
	}
	return render(nodes, props, options);
}

export function render(nodes: TemplateNode[], props: Props, options: RenderOptions = {}): string {
	return renderNodes(nodes, {
		props: props ?? {},
		scope: new Map(),
		indices: new Map(),
		anchors: options.editorAnchors !== false
	});
}

function renderNodes(nodes: TemplateNode[], ctx: RenderContext): string {
	let out = '';
	for (const node of nodes) out += renderNode(node, ctx);
	return out;
}

function renderNode(node: TemplateNode, ctx: RenderContext): string {
	switch (node.type) {
		case 'text':
			return escapeText(node.value);

		case 'comment':
			return `<!--${node.value}-->`;

		case 'prop':
			// A declaration only — it exists to put a prop in the schema.
			return '';

		case 'mustache': {
			const value = resolve(node.reference, ctx);
			if (isRawHtml(node.reference)) return value == null ? '' : String(value);
			return escapeText(stringify(value));
		}

		case 'each': {
			const items = asArray(resolve(node.header.collection, ctx));
			const anchorPath = ctx.anchors ? node.canonicalPath : '';
			// The editor needs one element per entry to attach to; that is only
			// unambiguous when the block body *is* a single element.
			const sole = anchorPath ? soleElement(node.children) : null;

			let out = '';
			for (const [index, item] of items.entries()) {
				const inner: RenderContext = {
					...ctx,
					scope: new Map(ctx.scope).set(node.header.alias, item),
					indices: node.header.indexAlias
						? new Map(ctx.indices).set(node.header.indexAlias, index)
						: ctx.indices
				};
				out += sole
					? renderAnchoredItem(node.children, sole, anchorPath, inner)
					: renderNodes(node.children, inner);
			}
			return out;
		}

		case 'if': {
			for (const branch of node.branches) {
				if (branch.test === null || truthy(evaluate(branch.test, ctx))) {
					return renderNodes(branch.children, ctx);
				}
			}
			return '';
		}

		case 'element':
			return renderElement(node, ctx);
	}
}

/** Render an `{#each}` body, tagging its single element as the collection item. */
function renderAnchoredItem(
	nodes: TemplateNode[],
	sole: ElementNode,
	path: string,
	ctx: RenderContext
): string {
	let out = '';
	for (const node of nodes) {
		out +=
			node === sole
				? renderElement(sole, ctx, [
						{ name: COLLECTION_ATTR, parts: [{ type: 'text', value: path }] }
					])
				: renderNode(node, ctx);
	}
	return out;
}

function renderElement(
	el: ElementNode,
	ctx: RenderContext,
	extra: TemplateAttribute[] = []
): string {
	const attributes: RenderedAttribute[] = [];

	for (const attribute of [...el.attributes, ...extra]) {
		const rendered = renderAttribute(attribute, ctx);
		if (rendered) attributes.push(rendered);
	}

	const anchor = ctx.anchors ? contentAnchor(el) : null;
	if (anchor && !hasAttribute(attributes, FIELD_ATTR)) {
		attributes.push({ name: FIELD_ATTR, value: anchor.path });
		if (!hasAttribute(attributes, KIND_ATTR)) {
			attributes.push({ name: KIND_ATTR, value: anchor.kind });
		}
	}

	const open = `<${el.name}${serializeAttributes(attributes)}`;
	if (isVoidElement(el.name)) return `${open}>`;
	return `${open}>${renderNodes(el.children, ctx)}</${el.name}>`;
}

// ---------------------------------------------------------------------------
// Attributes
// ---------------------------------------------------------------------------

interface RenderedAttribute {
	name: string;
	/** `null` renders the attribute as a bare boolean attribute. */
	value: string | null;
}

function hasAttribute(attributes: RenderedAttribute[], name: string): boolean {
	return attributes.some((attribute) => attribute.name === name);
}

function renderAttribute(
	attribute: TemplateAttribute,
	ctx: RenderContext
): RenderedAttribute | null {
	const parts = attribute.parts;
	if (parts === null) return { name: attribute.name, value: null };

	if (attribute.name.toLowerCase() === 'style') {
		const value = renderStyle(parts, ctx);
		return value ? { name: attribute.name, value } : null;
	}

	// A lone interpolation carries the value's own type: an absent or `false`
	// value drops the attribute entirely, so `data-featured={plan.featured}`
	// simply is not there for a plan that is not featured.
	//
	// `true` is written out as `="true"` rather than as a bare boolean
	// attribute. Bare would be valid HTML, but attribute-value selectors —
	// Tailwind's `data-[featured=true]:` among them — match on the value, and
	// styling off a bound flag is the main reason to write one of these.
	if (parts.length === 1 && parts[0].type === 'mustache') {
		const value = resolve(parts[0].reference, ctx);
		if (value === null || value === undefined || value === false) return null;
		return { name: attribute.name, value: value === true ? 'true' : stringify(value) };
	}

	let out = '';
	for (const part of parts) {
		out += part.type === 'text' ? part.value : stringify(resolve(part.reference, ctx));
	}
	return { name: attribute.name, value: out };
}

/**
 * Assemble a `style` attribute declaration by declaration, dropping any whose
 * interpolation resolved to nothing.
 */
function renderStyle(parts: AttributePart[], ctx: RenderContext): string {
	const chunks: StyleChunk[] = [{ text: '', incomplete: false }];
	const last = () => chunks[chunks.length - 1];

	for (const part of parts) {
		if (part.type === 'text') {
			const pieces = part.value.split(';');
			last().text += pieces[0];
			for (const piece of pieces.slice(1)) {
				chunks.push({ text: piece, incomplete: false });
			}
			continue;
		}

		const value = stringify(resolve(part.reference, ctx));
		if (!value) last().incomplete = true;
		else last().text += sanitizeStyleValue(value);
	}

	return joinStyleChunks(chunks);
}

function serializeAttributes(attributes: RenderedAttribute[]): string {
	let out = '';
	for (const attribute of attributes) {
		out +=
			attribute.value === null
				? ` ${attribute.name}`
				: ` ${attribute.name}="${escapeAttribute(attribute.value)}"`;
	}
	return out;
}

// ---------------------------------------------------------------------------
// Editor anchors
// ---------------------------------------------------------------------------

/** The single element child of a block, ignoring whitespace-only text. */
function soleElement(nodes: TemplateNode[]): ElementNode | null {
	const significant = nodes.filter(isSignificant);
	const [only] = significant;
	return significant.length === 1 && only.type === 'element' ? only : null;
}

/** The interpolation that makes up an element's entire content, if any. */
function contentAnchor(el: ElementNode): { path: string; kind: string } | null {
	const significant = el.children.filter(isSignificant);
	if (significant.length !== 1) return null;

	const [only] = significant;
	if (only.type !== 'mustache' || only.reference.isIndex) return null;

	const path = only.reference.canonicalPath || only.reference.path;
	return path ? { path, kind: anchorKind(only.reference) } : null;
}

function anchorKind(reference: Reference): string {
	for (const tag of reference.tags) {
		if (tag.name === 'richtext' || tag.name === 'icon' || tag.name === 'image') return tag.name;
	}
	return 'text';
}

function isSignificant(node: TemplateNode): boolean {
	if (node.type === 'text') return node.value.trim() !== '';
	return node.type !== 'prop' && node.type !== 'comment';
}

// ---------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------

function isRawHtml(reference: Reference): boolean {
	return reference.tags.some((tag) => RAW_HTML_TAGS.has(tag.name));
}

/** Resolve a reference against the scope chain, applying its `??` fallback. */
function resolve(reference: Reference, ctx: RenderContext): unknown {
	if (reference.isIndex) {
		return ctx.indices.get(reference.path) ?? 0;
	}

	const dot = reference.path.indexOf('.');
	const head = dot === -1 ? reference.path : reference.path.slice(0, dot);
	const rest = dot === -1 ? '' : reference.path.slice(dot + 1);

	const value = ctx.scope.has(head)
		? getByPath(ctx.scope.get(head), rest)
		: getByPath(ctx.props, reference.path);

	if (!reference.hasFallback) return value;
	return isAbsent(value) ? reference.fallback : value;
}

/**
 * Absent means "show the fallback": null, undefined, or an empty string. An
 * emptied field falls back to its placeholder rather than rendering a hole,
 * which is what makes `??` serve as both default and preview content.
 */
function isAbsent(value: unknown): boolean {
	return value === null || value === undefined || value === '';
}

function getByPath(source: unknown, path: string): unknown {
	if (!path) return source;
	let current: unknown = source;
	for (const segment of path.split('.')) {
		if (current === null || typeof current !== 'object') return undefined;
		current = (current as Record<string, unknown>)[segment];
	}
	return current;
}

function evaluate(condition: Condition, ctx: RenderContext): unknown {
	switch (condition.kind) {
		case 'reference':
			return resolve(condition, ctx);
		case 'literal':
			return condition.value;
		case 'not':
			return !truthy(evaluate(condition.operand, ctx));
		case 'compare':
			return compare(condition.operator, evaluate(condition.left, ctx), evaluate(condition.right, ctx));
	}
}

function compare(operator: string, left: unknown, right: unknown): boolean {
	switch (operator) {
		case '==':
			return left === right;
		case '!=':
			return left !== right;
		case '>':
			return (left as number) > (right as number);
		case '<':
			return (left as number) < (right as number);
		case '>=':
			return (left as number) >= (right as number);
		case '<=':
			return (left as number) <= (right as number);
		default:
			return false;
	}
}

function truthy(value: unknown): boolean {
	if (Array.isArray(value)) return value.length > 0;
	return Boolean(value);
}

function asArray(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}

function stringify(value: unknown): string {
	if (value === null || value === undefined) return '';
	if (typeof value === 'string') return value;
	return String(value as LiteralValue);
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
