/**
 * Dependency-free parser for `.brix` templates.
 *
 * A template is HTML with `{ … }` blocks: interpolations, `{#each}`, `{#if}`,
 * and `{@prop}` declarations. The scanner walks `<` and `{` at the same level,
 * so a brace inside a tag (`href={cta.href}`) and a tag inside a block are both
 * handled without a second pass.
 *
 * Attribute order and casing are preserved so rendered output matches the
 * authored markup.
 *
 * After the tree is built, {@link bind} walks it once with a scope stack and
 * stamps every reference with its **canonical path** — the alias-free form the
 * rest of the system speaks: `plan.name` inside `{#each plans as plan}` becomes
 * `plans[].name`. Resolving scopes here, once, is what lets the renderer, the
 * schema analyzer and the editor anchors all agree without repeating the walk.
 */

import {
	parseCondition,
	parseEachHeader,
	parseReference,
	TemplateSyntaxError,
	type Condition,
	type EachHeader,
	type Reference
} from './expression.js';

export interface TextNode {
	type: 'text';
	value: string;
}

export interface CommentNode {
	type: 'comment';
	value: string;
}

/** `{path}` in element content. */
export interface MustacheNode {
	type: 'mustache';
	reference: Reference;
	offset: number;
}

/** `{@prop @boolean autoplay ?? false}` — declares a prop, renders nothing. */
export interface PropDeclarationNode {
	type: 'prop';
	reference: Reference;
	offset: number;
}

export interface EachNode {
	type: 'each';
	header: EachHeader;
	/** Canonical path of the collection (`plans`, or `plans[].tiers` nested). */
	canonicalPath: string;
	children: TemplateNode[];
	offset: number;
}

export interface IfBranch {
	/** `null` for the trailing `{:else}`. */
	test: Condition | null;
	children: TemplateNode[];
}

export interface IfNode {
	type: 'if';
	branches: IfBranch[];
	offset: number;
}

export type AttributePart =
	| { type: 'text'; value: string }
	| { type: 'mustache'; reference: Reference; offset: number };

export interface TemplateAttribute {
	name: string;
	/** `null` for a boolean attribute written without a value (`disabled`). */
	parts: AttributePart[] | null;
}

export interface ElementNode {
	type: 'element';
	name: string;
	attributes: TemplateAttribute[];
	children: TemplateNode[];
	offset: number;
}

export type TemplateNode =
	| ElementNode
	| TextNode
	| CommentNode
	| MustacheNode
	| PropDeclarationNode
	| EachNode
	| IfNode;

const VOID_ELEMENTS = new Set([
	'area',
	'base',
	'br',
	'col',
	'embed',
	'hr',
	'img',
	'input',
	'link',
	'meta',
	'param',
	'source',
	'track',
	'wbr'
]);

export function isVoidElement(name: string): boolean {
	return VOID_ELEMENTS.has(name.toLowerCase());
}

/** Parse a template body into a bound AST. */
export function parseTemplate(input: string): TemplateNode[] {
	const nodes = scan(input);
	bind(nodes);
	return nodes;
}

// ---------------------------------------------------------------------------
// Scanner
// ---------------------------------------------------------------------------

type Frame =
	| { kind: 'root'; children: TemplateNode[] }
	| { kind: 'element'; node: ElementNode }
	| { kind: 'each'; node: EachNode }
	| { kind: 'if'; node: IfNode };

function childrenOf(frame: Frame): TemplateNode[] {
	if (frame.kind === 'root') return frame.children;
	if (frame.kind === 'if') return frame.node.branches[frame.node.branches.length - 1].children;
	return frame.node.children;
}

function scan(input: string): TemplateNode[] {
	const root: Frame = { kind: 'root', children: [] };
	const stack: Frame[] = [root];
	let index = 0;

	const top = () => stack[stack.length - 1];
	const push = (node: TemplateNode) => childrenOf(top()).push(node);

	while (index < input.length) {
		const char = input[index];

		if (char !== '<' && char !== '{') {
			const stop = nextMarker(input, index);
			push({ type: 'text', value: input.slice(index, stop) });
			index = stop;
			continue;
		}

		if (char === '{') {
			const end = scanExpression(input, index);
			if (end === -1) {
				throw new TemplateSyntaxError('unterminated `{` block', index);
			}
			index = handleBlock(input.slice(index + 1, end), index, stack) ?? end + 1;
			continue;
		}

		// Comment
		if (input.startsWith('<!--', index)) {
			const end = input.indexOf('-->', index + 4);
			const stop = end === -1 ? input.length : end;
			push({ type: 'comment', value: input.slice(index + 4, stop) });
			index = end === -1 ? input.length : end + 3;
			continue;
		}

		// Declarations / processing instructions — skipped whole.
		if (input[index + 1] === '!' || input[index + 1] === '?') {
			const end = input.indexOf('>', index);
			index = end === -1 ? input.length : end + 1;
			continue;
		}

		// Closing tag
		if (input[index + 1] === '/') {
			const end = input.indexOf('>', index);
			const name = input
				.slice(index + 2, end === -1 ? input.length : end)
				.trim()
				.toLowerCase();
			for (let depth = stack.length - 1; depth > 0; depth -= 1) {
				const frame = stack[depth];
				if (frame.kind === 'element' && frame.node.name.toLowerCase() === name) {
					stack.length = depth;
					break;
				}
			}
			index = end === -1 ? input.length : end + 1;
			continue;
		}

		// Opening tag
		const tagEnd = findTagEnd(input, index);
		if (tagEnd === -1) {
			push({ type: 'text', value: input.slice(index) });
			break;
		}

		const parsed = parseOpenTag(input.slice(index, tagEnd + 1), index);
		if (!parsed) {
			push({ type: 'text', value: '<' });
			index += 1;
			continue;
		}

		const node: ElementNode = {
			type: 'element',
			name: parsed.name,
			attributes: parsed.attributes,
			children: [],
			offset: index
		};
		push(node);

		if (!parsed.selfClosing && !isVoidElement(parsed.name)) {
			stack.push({ kind: 'element', node });
		}
		index = tagEnd + 1;
	}

	return root.children;
}

/** Handle one `{ … }` token. Returns a new index, or `undefined` to continue. */
function handleBlock(source: string, offset: number, stack: Frame[]): number | undefined {
	const inner = source.trim();
	const innerOffset = offset + 1 + source.indexOf(inner.charAt(0));
	const top = () => stack[stack.length - 1];
	const push = (node: TemplateNode) => childrenOf(top()).push(node);

	if (inner.startsWith('#each')) {
		const header = parseEachHeader(inner.slice('#each'.length), innerOffset + 5);
		const node: EachNode = { type: 'each', header, canonicalPath: '', children: [], offset };
		push(node);
		stack.push({ kind: 'each', node });
		return undefined;
	}

	if (inner.startsWith('#if')) {
		const test = parseCondition(inner.slice('#if'.length), innerOffset + 3);
		const node: IfNode = { type: 'if', branches: [{ test, children: [] }], offset };
		push(node);
		stack.push({ kind: 'if', node });
		return undefined;
	}

	if (inner.startsWith(':else')) {
		const frame = top();
		if (frame.kind !== 'if') {
			throw new TemplateSyntaxError('`{:else}` outside an `{#if}` block', offset);
		}
		if (frame.node.branches[frame.node.branches.length - 1].test === null) {
			throw new TemplateSyntaxError('`{:else}` after a final `{:else}`', offset);
		}
		const rest = inner.slice(':else'.length).trim();
		const chained = /^if\b/.test(rest);
		if (!chained && rest) {
			throw new TemplateSyntaxError(`unexpected \`${rest}\` after \`{:else}\``, offset);
		}
		const test = chained
			? parseCondition(rest.slice(2), innerOffset + inner.indexOf('if', 5) + 2)
			: null;
		frame.node.branches.push({ test, children: [] });
		return undefined;
	}

	if (inner.startsWith('/')) {
		const name = inner.slice(1).trim();
		const frame = top();
		if (frame.kind !== name) {
			throw new TemplateSyntaxError(`\`{/${name}}\` does not close an open block`, offset);
		}
		stack.pop();
		return undefined;
	}

	if (inner.startsWith('@prop')) {
		const reference = parseReference(inner.slice('@prop'.length), innerOffset + 5);
		push({ type: 'prop', reference, offset });
		return undefined;
	}

	push({ type: 'mustache', reference: parseReference(inner, innerOffset), offset });
	return undefined;
}

/** Next `<` or `{`, or the end of input. */
function nextMarker(input: string, from: number): number {
	for (let index = from; index < input.length; index += 1) {
		if (input[index] === '<' || input[index] === '{') return index;
	}
	return input.length;
}

/**
 * Index of the `}` closing the block opened at `start`, tolerating nested braces
 * and quoted string literals inside it.
 */
export function scanExpression(input: string, start: number): number {
	let depth = 0;
	let quote: string | null = null;
	for (let index = start; index < input.length; index += 1) {
		const char = input[index];
		if (quote) {
			if (char === '\\') index += 1;
			else if (char === quote) quote = null;
			continue;
		}
		if (char === '"' || char === "'") {
			quote = char;
			continue;
		}
		if (char === '{') depth += 1;
		else if (char === '}') {
			depth -= 1;
			if (depth === 0) return index;
		}
	}
	return -1;
}

/** Index of the `>` closing the tag started at `start`, skipping quotes and braces. */
function findTagEnd(input: string, start: number): number {
	for (let index = start + 1; index < input.length; index += 1) {
		const char = input[index];
		if (char === '"' || char === "'") {
			const end = scanQuoted(input, index);
			if (end === -1) return -1;
			index = end;
			continue;
		}
		if (char === '{') {
			const end = scanExpression(input, index);
			if (end === -1) return -1;
			index = end;
			continue;
		}
		if (char === '>') return index;
	}
	return -1;
}

/** Index of the quote closing the one at `start`, skipping `{ … }` blocks. */
function scanQuoted(input: string, start: number): number {
	const quote = input[start];
	for (let index = start + 1; index < input.length; index += 1) {
		const char = input[index];
		if (char === '{') {
			const end = scanExpression(input, index);
			if (end === -1) return -1;
			index = end;
			continue;
		}
		if (char === quote) return index;
	}
	return -1;
}

interface OpenTag {
	name: string;
	attributes: TemplateAttribute[];
	selfClosing: boolean;
}

function parseOpenTag(raw: string, offset: number): OpenTag | null {
	const nameMatch = /^<([A-Za-z][A-Za-z0-9:_-]*)/.exec(raw);
	if (!nameMatch) return null;

	const name = nameMatch[1];
	const attributes: TemplateAttribute[] = [];
	let index = nameMatch[0].length;
	let selfClosing = false;

	// The trailing `>` is not part of the attribute region.
	const end = raw.length - 1;

	while (index < end) {
		const char = raw[index];
		if (/\s/.test(char)) {
			index += 1;
			continue;
		}
		if (char === '/') {
			selfClosing = true;
			index += 1;
			continue;
		}

		const attrName = readAttributeName(raw, index, end);
		if (!attrName) {
			index += 1;
			continue;
		}
		index += attrName.length;

		let cursor = index;
		while (cursor < end && /\s/.test(raw[cursor])) cursor += 1;
		if (raw[cursor] !== '=') {
			attributes.push({ name: attrName, parts: null });
			continue;
		}

		cursor += 1;
		while (cursor < end && /\s/.test(raw[cursor])) cursor += 1;

		const value = readAttributeValue(raw, cursor, end, offset);
		attributes.push({ name: attrName, parts: value.parts });
		index = value.next;
	}

	return { name, attributes, selfClosing };
}

function readAttributeName(raw: string, start: number, end: number): string {
	let index = start;
	while (index < end && !/[\s=/>]/.test(raw[index])) index += 1;
	return raw.slice(start, index);
}

function readAttributeValue(
	raw: string,
	start: number,
	end: number,
	offset: number
): { parts: AttributePart[]; next: number } {
	const char = raw[start];

	if (char === '"' || char === "'") {
		const close = scanQuoted(raw, start);
		const stop = close === -1 ? end : close;
		return {
			parts: splitInterpolations(raw.slice(start + 1, stop), offset + start + 1),
			next: stop + 1
		};
	}

	if (char === '{') {
		const close = scanExpression(raw, start);
		const stop = close === -1 ? end - 1 : close;
		return {
			parts: splitInterpolations(raw.slice(start, stop + 1), offset + start),
			next: stop + 1
		};
	}

	let index = start;
	while (index < end && !/[\s>]/.test(raw[index])) index += 1;
	return { parts: splitInterpolations(raw.slice(start, index), offset + start), next: index };
}

/** Split an attribute value into literal chunks and `{ … }` interpolations. */
function splitInterpolations(source: string, offset: number): AttributePart[] {
	const parts: AttributePart[] = [];
	let index = 0;
	let text = '';

	while (index < source.length) {
		if (source[index] !== '{') {
			text += source[index];
			index += 1;
			continue;
		}

		const close = scanExpression(source, index);
		if (close === -1) {
			throw new TemplateSyntaxError('unterminated `{` in attribute value', offset + index);
		}
		if (text) {
			parts.push({ type: 'text', value: text });
			text = '';
		}
		const inner = source.slice(index + 1, close);
		parts.push({
			type: 'mustache',
			reference: parseReference(inner, offset + index + 1),
			offset: offset + index
		});
		index = close + 1;
	}

	if (text) parts.push({ type: 'text', value: text });
	return parts;
}

// ---------------------------------------------------------------------------
// Scope binding
// ---------------------------------------------------------------------------

interface Scope {
	/** Alias → canonical path of the item it stands for (`plans[]`). */
	items: Map<string, string>;
	/** Aliases bound to an `{#each … , i}` index. */
	indices: Set<string>;
}

function childScope(parent: Scope): Scope {
	return { items: new Map(parent.items), indices: new Set(parent.indices) };
}

/** Stamp every reference in the tree with its alias-free canonical path. */
export function bind(nodes: TemplateNode[]): void {
	bindNodes(nodes, { items: new Map(), indices: new Set() });
}

function bindNodes(nodes: TemplateNode[], scope: Scope): void {
	for (const node of nodes) bindNode(node, scope);
}

function bindNode(node: TemplateNode, scope: Scope): void {
	switch (node.type) {
		case 'text':
		case 'comment':
			return;

		case 'mustache':
		case 'prop':
			bindReference(node.reference, scope);
			return;

		case 'element': {
			for (const attribute of node.attributes) {
				for (const part of attribute.parts ?? []) {
					if (part.type === 'mustache') bindReference(part.reference, scope);
				}
			}
			bindNodes(node.children, scope);
			return;
		}

		case 'each': {
			bindReference(node.header.collection, scope);
			node.canonicalPath = node.header.collection.canonicalPath;
			const inner = childScope(scope);
			inner.items.set(node.header.alias, `${node.canonicalPath}[]`);
			inner.indices.delete(node.header.alias);
			if (node.header.indexAlias) {
				inner.indices.add(node.header.indexAlias);
				inner.items.delete(node.header.indexAlias);
			}
			bindNodes(node.children, inner);
			return;
		}

		case 'if': {
			for (const branch of node.branches) {
				if (branch.test) bindCondition(branch.test, scope);
				bindNodes(branch.children, scope);
			}
			return;
		}
	}
}

function bindReference(reference: Reference, scope: Scope): void {
	const resolved = resolvePath(reference.path, scope);
	reference.canonicalPath = resolved.path;
	reference.isIndex = resolved.isIndex;
}

function bindCondition(condition: Condition, scope: Scope): void {
	switch (condition.kind) {
		case 'reference':
			bindReference(condition, scope);
			return;
		case 'not':
			bindCondition(condition.operand, scope);
			return;
		case 'compare':
			bindCondition(condition.left, scope);
			bindCondition(condition.right, scope);
			return;
		default:
			return;
	}
}

/** Resolve a written path against the alias scope. */
export function resolvePath(path: string, scope: Scope): { path: string; isIndex: boolean } {
	const dot = path.indexOf('.');
	const head = dot === -1 ? path : path.slice(0, dot);
	const rest = dot === -1 ? '' : path.slice(dot + 1);

	if (scope.indices.has(head)) return { path: '', isIndex: true };

	const bound = scope.items.get(head);
	if (bound === undefined) return { path, isIndex: false };
	return { path: rest ? `${bound}.${rest}` : bound, isIndex: false };
}

export type { Scope };
