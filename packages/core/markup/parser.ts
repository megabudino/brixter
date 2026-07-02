/**
 * Dependency-free HTML template parser for plain `.brix` markup.
 *
 * Produces a small, serializable AST consumed by the runtime interpreter
 * (`render.ts`). Brix bodies are authored HTML (no Svelte, no logic — see the
 * runtime-interpreter plan), so a lightweight tokenizer covering elements,
 * attributes, text and comments is sufficient. Attribute order and casing are
 * preserved so the output matches the authored markup (and keeps every
 * `data-brixter-*` attribute the editor relies on).
 */

export interface TemplateAttribute {
	name: string;
	/** `null` for boolean attributes written without a value (e.g. `disabled`). */
	value: string | null;
}

export interface ElementNode {
	type: 'element';
	name: string;
	attributes: TemplateAttribute[];
	children: TemplateNode[];
}

export interface TextNode {
	type: 'text';
	value: string;
}

export interface CommentNode {
	type: 'comment';
	value: string;
}

export type TemplateNode = ElementNode | TextNode | CommentNode;

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

interface RootFrame {
	children: TemplateNode[];
}

export function parseTemplate(input: string): TemplateNode[] {
	const root: RootFrame = { children: [] };
	const stack: Array<RootFrame | ElementNode> = [root];
	let index = 0;

	const top = (): RootFrame | ElementNode => stack[stack.length - 1];

	while (index < input.length) {
		if (input[index] !== '<') {
			const next = input.indexOf('<', index);
			const stop = next === -1 ? input.length : next;
			top().children.push({ type: 'text', value: input.slice(index, stop) });
			index = stop;
			continue;
		}

		// Comment
		if (input.startsWith('<!--', index)) {
			const end = input.indexOf('-->', index + 4);
			const valueEnd = end === -1 ? input.length : end;
			top().children.push({ type: 'comment', value: input.slice(index + 4, valueEnd) });
			index = end === -1 ? input.length : end + 3;
			continue;
		}

		// Other declarations / processing instructions (<!doctype>, <?...>) → skip whole token
		if (input[index + 1] === '!' || input[index + 1] === '?') {
			const end = input.indexOf('>', index);
			index = end === -1 ? input.length : end + 1;
			continue;
		}

		// Closing tag
		if (input[index + 1] === '/') {
			const end = input.indexOf('>', index);
			const name = input.slice(index + 2, end === -1 ? input.length : end).trim().toLowerCase();
			for (let depth = stack.length - 1; depth > 0; depth -= 1) {
				const frame = stack[depth] as ElementNode;
				if (frame.name.toLowerCase() === name) {
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
			top().children.push({ type: 'text', value: input.slice(index) });
			break;
		}

		const raw = input.slice(index, tagEnd + 1);
		const parsed = parseOpenTag(raw);
		if (!parsed) {
			// Not a real tag — emit the `<` as text and continue past it.
			top().children.push({ type: 'text', value: '<' });
			index += 1;
			continue;
		}

		const node: ElementNode = {
			type: 'element',
			name: parsed.name,
			attributes: parsed.attributes,
			children: []
		};
		top().children.push(node);

		if (!parsed.selfClosing && !isVoidElement(parsed.name)) {
			stack.push(node);
		}
		index = tagEnd + 1;
	}

	return root.children;
}

/** Index of the `>` that closes the tag started at `start`, respecting quotes. */
function findTagEnd(input: string, start: number): number {
	let quote: '"' | "'" | null = null;
	for (let cursor = start + 1; cursor < input.length; cursor += 1) {
		const char = input[cursor];
		if (quote) {
			if (char === quote) quote = null;
			continue;
		}
		if (char === '"' || char === "'") {
			quote = char;
			continue;
		}
		if (char === '>') {
			return cursor;
		}
	}
	return -1;
}

const ATTRIBUTE_PATTERN =
	/([^\s=/>]+)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

interface OpenTag {
	name: string;
	attributes: TemplateAttribute[];
	selfClosing: boolean;
}

function parseOpenTag(raw: string): OpenTag | null {
	// Strip leading `<` and trailing `>`.
	let inner = raw.slice(1, -1).trim();
	let selfClosing = false;
	if (inner.endsWith('/')) {
		selfClosing = true;
		inner = inner.slice(0, -1).trim();
	}

	const nameMatch = inner.match(/^([A-Za-z][A-Za-z0-9:_-]*)/);
	if (!nameMatch) {
		return null;
	}
	const name = nameMatch[1];
	const attrSource = inner.slice(name.length);

	const attributes: TemplateAttribute[] = [];
	for (const match of attrSource.matchAll(ATTRIBUTE_PATTERN)) {
		const attrName = match[1];
		if (!attrName) continue;
		const rawValue = match[3] ?? match[4] ?? match[5];
		attributes.push({ name: attrName, value: rawValue === undefined ? null : rawValue });
	}

	return { name, attributes, selfClosing };
}
