import { parse } from 'svelte/compiler';
import MagicString from 'magic-string';
import { createBuilderFieldsFromMarkup } from './markup-schema.js';
import {
	BUILDER_ITEM_ID_KEY,
	inferBuilderFieldKind,
	type BuilderField,
	type BuilderFields
} from '../core.js';

export interface BrixterPreprocessorOptions {
	disable?: boolean;
}

/**
 * Svelte markup preprocessor for `.brix.svelte` files.
 *
 * Transforms plain annotated markup into a Svelte component with:
 * - Auto-inferred `brixterSchema` export for builder discovery
 * - Auto-injected `$props()` for top-level field roots
 * - Svelte expression replacement in annotated elements
 * - {#each} wrapping around collection item containers
 */
export function brixter(options: BrixterPreprocessorOptions = {}) {
	return {
		name: 'brixter',
		markup({ content, filename }: { content: string; filename?: string }) {
			if (options.disable) return;
			if (!filename?.endsWith('.brix.svelte')) return;

			const fields = createBuilderFieldsFromMarkup(content);
			const propNames = Object.keys(fields);

			if (propNames.length === 0) return;

			const s = new MagicString(content);
			const ast = parse(content, { filename, modern: true });

			injectSchemaExport(s, ast, fields);
			injectProps(s, ast, fields);
			transformAnnotatedElements(s, ast, fields);

			return {
				code: s.toString(),
				map: s.generateMap({ source: filename, hires: true }).toString()
			};
		}
	};
}

// ---------------------------------------------------------------------------
// Schema export injection
// ---------------------------------------------------------------------------

function injectSchemaExport(
	s: MagicString,
	ast: ReturnType<typeof parse>,
	fields: Record<string, unknown>
): void {
	const src = `export const brixterSchema = ${JSON.stringify(fields)};`;

	const moduleScript = ast.module as { content?: { start: number } } | undefined;
	if (moduleScript?.content) {
		s.appendLeft(moduleScript.content.start + 1, `${src}\n`);
		return;
	}

	const instanceScript = ast.instance as { start?: number } | undefined;
	if (instanceScript?.start !== undefined) {
		s.appendLeft(
			instanceScript.start,
			`\n<script module>${src}</script>\n`
		);
		return;
	}

	s.prepend(`<script module>${src}</script>\n`);
}

// ---------------------------------------------------------------------------
// Props injection
// ---------------------------------------------------------------------------

function injectProps(
	s: MagicString,
	ast: ReturnType<typeof parse>,
	fields: BuilderFields
): void {
	// Each inferred prop gets an empty-safe default keyed on its kind so an
	// absent/empty value never reaches the runtime as `undefined` — which would
	// crash hand-written `{#each items}` / `cta.label` accesses in published
	// output. Empty means "render nothing", not the editor's placeholder content.
	const declarations = Object.entries(fields).map(
		([name, field]) => `${name} = ${emptyDefaultLiteral(field)}`
	);

	const instanceScript = ast.instance as { content?: { start: number; end: number } } | undefined;

	if (instanceScript?.content) {
		const contentSlice = s.original.slice(instanceScript.content.start, instanceScript.content.end);
		const propsMatch = contentSlice.match(/(?:let|const)\s*\{\s*([^}]*)\s*\}\s*=\s*\$props\(\)/);

		if (propsMatch) {
			// Merge inferred names into the existing $props() destructuring without
			// overriding defaults the author already declared (e.g. `columns = 3`).
			const existingDecls = propsMatch[1]
				.split(',')
				.map((n) => n.trim())
				.filter(Boolean);
			const existingNames = new Set(existingDecls.map(bareDestructureName));
			const newDecls = declarations.filter(
				(decl) => !existingNames.has(bareDestructureName(decl))
			);
			if (newDecls.length === 0) return;

			const allDecls = [...existingDecls, ...newDecls];
			const newDecl = `let { ${allDecls.join(', ')} } = $props()`;

			s.overwrite(
				instanceScript.content.start + (propsMatch.index ?? 0),
				instanceScript.content.start + (propsMatch.index ?? 0) + propsMatch[0].length,
				newDecl
			);
			return;
		}

		// No existing $props() — append as before
		const decl = `let { ${declarations.join(', ')} } = $props();`;
		s.appendLeft(instanceScript.content.start + 1, `${decl}\n`);
		return;
	}

	const decl = `let { ${declarations.join(', ')} } = $props();`;

	const moduleScript = ast.module as { end?: number } | undefined;
	if (moduleScript?.end !== undefined) {
		s.appendRight(moduleScript.end, `\n<script>${decl}</script>\n`);
		return;
	}

	s.prepend(`<script>${decl}</script>\n`);
}

/** Extracts the bound name from a destructuring entry (`a = 1`, `a: b`, `a`). */
function bareDestructureName(decl: string): string {
	return decl.split('=')[0].split(':')[0].trim();
}

/**
 * Empty-safe default literal for a field, recursive for objects so deeply nested
 * accesses (e.g. `cta.href`) never throw on a missing parent.
 */
function emptyDefaultLiteral(field: BuilderField): string {
	const kind = inferBuilderFieldKind(field);

	if (kind === 'array') return '[]';

	if (kind === 'object') {
		if (!field.fields) return '{}';
		const entries = Object.entries(field.fields).map(
			([key, nested]) => `${objectKey(key)}: ${emptyDefaultLiteral(nested)}`
		);
		return `{ ${entries.join(', ')} }`;
	}

	if (kind === 'boolean') return 'false';
	if (kind === 'number') return '0';

	return "''";
}

function objectKey(key: string): string {
	return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : JSON.stringify(key);
}

// ---------------------------------------------------------------------------
// Attribute helpers
// ---------------------------------------------------------------------------

interface SvelteBlock {
	type: string;
	start: number;
	end: number;
	nodes?: SvelteBlock[];
	fragment?: SvelteBlock;
	children?: Array<{ type: string; start: number; end: number; data?: string }>;
	attributes?: Array<{ name: string; value: unknown; start: number; end: number }>;
	name?: string;
	data?: string;
	raw?: string;
	expression?: { type: string; start: number; end: number };
}

function getAttrString(attr: { value: unknown } | undefined): string | undefined {
	if (!attr) return undefined;
	if (typeof attr.value === 'string') return attr.value;
	if (Array.isArray(attr.value)) {
		return (attr.value as Array<{ data?: string }>)
			.map((v) => v.data ?? '')
			.join('');
	}
	return undefined;
}

// ---------------------------------------------------------------------------
// Collection item mapping from fields
// ---------------------------------------------------------------------------

function buildItemVars(fields: BuilderFields): Map<string, string> {
	const map = new Map<string, string>();
	for (const [name, field] of Object.entries(fields)) {
		if (field.item?.fields) {
			map.set(name, field.itemLabel ?? singularize(name));
		}
	}
	return map;
}

// ---------------------------------------------------------------------------
// Recursive AST walk
// ---------------------------------------------------------------------------

function walkNodes(nodes: SvelteBlock[] | undefined, fn: (node: SvelteBlock) => void): void {
	if (!nodes) return;
	for (const node of nodes) {
		fn(node);
		// Svelte 5: elements nest children in node.fragment.nodes
		walkNodes(node.fragment?.nodes, fn);
		// Fallback: also try direct .nodes
		walkNodes(node.nodes, fn);
		// Control flow blocks
		const dynamic = node as { body?: unknown; else?: unknown; then?: unknown; catch?: unknown };
		if (dynamic.body) walkNodes((dynamic.body as { nodes?: SvelteBlock[] })?.nodes, fn);
		if (dynamic.else) walkNodes((dynamic.else as { nodes?: SvelteBlock[] })?.nodes, fn);
		if (dynamic.then) walkNodes((dynamic.then as { nodes?: SvelteBlock[] })?.nodes, fn);
		if (dynamic.catch) walkNodes((dynamic.catch as { nodes?: SvelteBlock[] })?.nodes, fn);
	}
}

// ---------------------------------------------------------------------------
// Element transformation
// ---------------------------------------------------------------------------

function transformAnnotatedElements(
	s: MagicString,
	ast: ReturnType<typeof parse>,
	fields: BuilderFields
): void {
	const itemVars = buildItemVars(fields);

	const fragment = ast.fragment as { nodes?: SvelteBlock[] } | undefined;
	if (!fragment?.nodes) return;

	walkNodes(fragment.nodes, (node) => {
		if (node.type !== 'RegularElement') return;

		const attrs = node.attributes ?? [];
		const fieldAttr = attrs.find((a) => a.name === 'data-brixter-field');
		const kindAttr = attrs.find((a) => a.name === 'data-brixter-kind');
		const collectionAttr = attrs.find((a) => a.name === 'data-brixter-collection-item');

		// --- Collection item container → {#each} wrapper ---
		if (collectionAttr) {
			const colName = getAttrString(collectionAttr);
			if (colName && itemVars.has(colName)) {
				const itemVar = itemVars.get(colName)!;
				const indexVar = `${itemVar}_i`;
				// Key by the stable item id so the builder can reorder the collection
				// without reusing DOM nodes positionally (which strands inline editors
				// on the wrong item). Published props have the id stripped, so fall
				// back to the index where reordering never happens.
				s.appendLeft(
					node.start,
					`{#each ${colName} as ${itemVar}, ${indexVar} (${itemVar}?.['${BUILDER_ITEM_ID_KEY}'] ?? ${indexVar})}\n`
				);
				s.appendRight(node.end, `\n{/each}`);
			}
		}

		// --- Field annotation → Svelte expression ---
		if (fieldAttr) {
			const rawPath = getAttrString(fieldAttr);
			if (rawPath) {
				const kind = getAttrString(kindAttr) ?? (node.name === 'img' ? 'image' : 'text');
				const expr = resolvedExpr(rawPath, kind, itemVars);

				// <img> special case: rewrite src + replace children
				if (node.name === 'img' && kind === 'image') {
					const srcAttr = attrs.find((a) => a.name === 'src');
					if (srcAttr) {
						s.overwrite(srcAttr.start, srcAttr.end, `src=${expr}`);
					} else {
						s.appendLeft(node.start + node.name.length + 1, ` src=${expr}`);
					}
					// Drop children (if any)
					if (node.children?.length) {
						s.overwrite(node.children[0].start, node.children[node.children.length - 1].end, '');
					}
				} else {
					// Replace element text content with expression
					const children = node.fragment?.nodes;
					if (children?.length) {
						const first = children[0];
						const last = children[children.length - 1];

						// Capture the author's original static text as the field
						// placeholder (rendered greyed by the editor chrome via
						// `data-brixter-default`). Skip when the markup already holds an
						// expression (e.g. hand-written `{item.title}`) or an explicit
						// `data-brixter-default` attribute.
						const hasExpression = children.some((child) => child.type !== 'Text');
						const hasDefaultAttr = attrs.some((a) => a.name === 'data-brixter-default');
						if (node.name && !hasExpression && !hasDefaultAttr) {
							const original = s.original.slice(first.start, last.end);
							const placeholder = original.replace(/<[^>]*>/g, '').trim();
							if (placeholder) {
								s.appendLeft(
									node.start + node.name.length + 1,
									` data-brixter-default="${escapeAttribute(placeholder)}"`
								);
							}
						}

						s.overwrite(first.start, last.end, expr);
					}
				}
			}

			// --- data-brixter-bind: explicit HTML attribute → field path wiring ---
			const bindAttr = attrs.find((a) => a.name === 'data-brixter-bind');
			if (bindAttr && node.name) {
				const bindValue = getAttrString(bindAttr);
				if (bindValue) {
					const bindings = parseBindings(bindValue);
					for (const [htmlAttr, fieldPath] of bindings) {
						const resolvedPath = resolvePath(fieldPath, itemVars);
						const existingHtmlAttr = attrs.find((a) => a.name === htmlAttr);
						if (existingHtmlAttr) {
							s.overwrite(existingHtmlAttr.start, existingHtmlAttr.end, `${htmlAttr}={${resolvedPath}}`);
						} else {
							s.appendLeft(node.start + node.name.length + 1, ` ${htmlAttr}={${resolvedPath}}`);
						}
					}
				}
			}
		}
	});
}

function resolvedExpr(
	path: string,
	kind: string,
	itemVars: Map<string, string>
): string {
	const resolved = resolvePath(path, itemVars);

	if (kind === 'richtext-inline' || kind === 'richtext-block' || kind === 'icon') {
		return `{@html ${resolved} ?? ''}`;
	}

	return `{${resolved}}`;
}

function resolvePath(path: string, itemVars: Map<string, string>): string {
	const idx = path.indexOf('[]');
	if (idx === -1) return path;

	const collectionName = path.slice(0, idx);
	const rest = path.slice(idx + 2);
	const itemVar = itemVars.get(collectionName);
	if (!itemVar) return path.replace('[]', '[0]');

	return itemVar + rest;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function escapeAttribute(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/"/g, '&quot;')
		.replace(/\s+/g, ' ');
}

function singularize(word: string): string {
	if (word.endsWith('ies')) return word.slice(0, -3) + 'y';
	if (word.endsWith('ses')) return word.slice(0, -2);
	if (word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
	return word;
}

// ---------------------------------------------------------------------------
// data-brixter-bind parsing
// ---------------------------------------------------------------------------

/**
 * Parse `data-brixter-bind="href:cta.href; target:cta.target"` into
 * `[['href', 'cta.href'], ['target', 'cta.target']]`.
 */
function parseBindings(value: string): Array<[string, string]> {
	const bindings: Array<[string, string]> = [];
	for (const part of value.split(';')) {
		const trimmed = part.trim();
		if (!trimmed) continue;
		const colon = trimmed.indexOf(':');
		if (colon === -1) continue;
		const htmlAttr = trimmed.slice(0, colon).trim();
		const fieldPath = trimmed.slice(colon + 1).trim();
		if (htmlAttr && fieldPath) {
			bindings.push([htmlAttr, fieldPath]);
		}
	}
	return bindings;
}
