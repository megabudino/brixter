/**
 * Derive a brik's schema from its template.
 *
 * This is the module everything else leans on. There is no authored schema
 * document: the props a brik accepts, their types, their defaults and their
 * editor labels are all read back out of the markup that uses them. Page
 * validation, the generated TypeScript, and the editor's field list are three
 * views of the single result produced here.
 *
 * ## How a type is decided
 *
 * Observations are collected per canonical path, then resolved in this order:
 *
 *   1. the path is the collection of an `{#each}`      → `array`
 *   2. sub-paths of it were observed                    → `object`
 *   3. an explicit `@tag` names a type                  → that type
 *   4. the attribute it feeds implies one (`src`, `href`) → `image` / `url`
 *   5. it is only ever tested by an `{#if}`             → `boolean`
 *   6. it has a `??` fallback                           → the literal's type
 *   7. otherwise                                        → `string`
 *
 * Rule 5 is why a condition claims nothing when the path has sub-paths:
 * `{#if cta}` guarding `{cta.label}` means "when present", not "a boolean".
 *
 * Plain text and attribute positions are read as *compatible with a scalar*
 * rather than as a claim of `string`, so annotating one occurrence and not
 * another (`{@number count}` here, `{count}` there) is not an error. What is an
 * error is a genuine contradiction: two different type tags on one path, or a
 * tag that disagrees with the structure the template itself imposes.
 */

import { humanizeKey, singularLabel } from '../schema/labels.js';
import {
	issue,
	SCALAR_TYPES,
	type BrikSchema,
	type PropSchema,
	type PropType,
	type SchemaIssue
} from '../schema/types.js';
import type { Condition, LiteralValue, Reference, Tag } from './expression.js';
import type { TemplateNode } from './parser.js';

/** `@tag` names that fix a prop's type outright. */
const TYPE_TAGS: Record<string, PropType> = {
	string: 'string',
	number: 'number',
	boolean: 'boolean',
	date: 'date',
	url: 'url',
	color: 'color',
	image: 'image',
	icon: 'icon',
	richtext: 'richtext',
	json: 'json'
};

/** `@tag` names that refine a prop without naming its type. */
const MODIFIER_TAGS = new Set(['enum', 'required', 'min', 'max', 'pattern', 'label']);

/** Attributes whose name is enough to tell what kind of value they take. */
const ATTRIBUTE_TYPES: Record<string, PropType> = {
	src: 'image',
	srcset: 'image',
	poster: 'image',
	href: 'url',
	action: 'url',
	formaction: 'url'
};

export interface AnalyzeOptions {
	/** File path used in diagnostics. */
	file?: string;
	/** Brik title, from the frontmatter. */
	title?: string;
	/** Brik description, from the frontmatter. */
	description?: string;
}

export interface AnalyzeResult {
	schema: BrikSchema;
	issues: SchemaIssue[];
}

/** Build the schema for a parsed, bound template. */
export function analyzeTemplate(
	nodes: TemplateNode[],
	options: AnalyzeOptions = {}
): AnalyzeResult {
	const file = options.file ?? '<template>';
	const issues: SchemaIssue[] = [];
	const root = createDraft('');

	collect(nodes, { root, issues, file });

	const props: Record<string, PropSchema> = {};
	for (const [key, child] of root.children) {
		props[key] = resolve(key, child, key, { issues, file });
	}

	return {
		schema: { title: options.title ?? '', description: options.description ?? '', props },
		issues
	};
}

// ---------------------------------------------------------------------------
// Draft tree
// ---------------------------------------------------------------------------

interface Draft {
	key: string;
	children: Map<string, Draft>;
	/** The element schema, once `{#each}` marks this path as a collection. */
	item?: Draft;
	isArray: boolean;
	explicitType?: PropType;
	explicitTypeTag?: string;
	attributeType?: PropType;
	options?: string[];
	required: boolean;
	fallback: LiteralValue | undefined;
	hasFallback: boolean;
	label?: string;
	min?: number;
	max?: number;
	pattern?: string;
	/** Rendered as text or into an attribute — so it must be a scalar. */
	usedAsScalar: boolean;
	/** Only ever tested by an `{#if}`. */
	usedInCondition: boolean;
}

function createDraft(key: string): Draft {
	return {
		key,
		children: new Map(),
		isArray: false,
		required: false,
		fallback: undefined,
		hasFallback: false,
		usedAsScalar: false,
		usedInCondition: false
	};
}

interface Context {
	root: Draft;
	issues: SchemaIssue[];
	file: string;
}

/** `plans[].tiers[].label` → `['plans', '[]', 'tiers', '[]', 'label']`. */
export function tokenizePath(path: string): string[] {
	const tokens: string[] = [];
	for (const segment of path.split('.')) {
		if (!segment) continue;
		const name = segment.replace(/(\[\])+$/, '');
		if (name) tokens.push(name);
		const arrays = segment.slice(name.length).length / 2;
		for (let depth = 0; depth < arrays; depth += 1) tokens.push('[]');
	}
	return tokens;
}

/** Get (creating as needed) the draft for a canonical path. */
function draftAt(root: Draft, path: string): Draft | null {
	let node = root;
	for (const token of tokenizePath(path)) {
		if (token === '[]') {
			node.isArray = true;
			node.item ??= createDraft(node.key);
			node = node.item;
			continue;
		}
		let child = node.children.get(token);
		if (!child) {
			child = createDraft(token);
			node.children.set(token, child);
		}
		node = child;
	}
	return node === root ? null : node;
}

// ---------------------------------------------------------------------------
// Collection
// ---------------------------------------------------------------------------

type Position = 'text' | 'attribute' | 'collection' | 'declaration';

function collect(nodes: TemplateNode[], ctx: Context): void {
	for (const node of nodes) {
		switch (node.type) {
			case 'text':
			case 'comment':
				break;

			case 'mustache':
				observe(node.reference, 'text', ctx);
				break;

			case 'prop':
				observe(node.reference, 'declaration', ctx);
				break;

			case 'element': {
				for (const attribute of node.attributes) {
					for (const part of attribute.parts ?? []) {
						if (part.type !== 'mustache') continue;
						observe(part.reference, 'attribute', ctx, attribute.name);
					}
				}
				collect(node.children, ctx);
				break;
			}

			case 'each':
				observe(node.header.collection, 'collection', ctx);
				collect(node.children, ctx);
				break;

			case 'if':
				for (const branch of node.branches) {
					if (branch.test) observeCondition(branch.test, ctx);
					collect(branch.children, ctx);
				}
				break;
		}
	}
}

function observeCondition(condition: Condition, ctx: Context): void {
	switch (condition.kind) {
		case 'reference': {
			const draft = record(condition, ctx);
			if (draft) draft.usedInCondition = true;
			break;
		}
		case 'not':
			observeCondition(condition.operand, ctx);
			break;
		case 'compare':
			observeCondition(condition.left, ctx);
			observeCondition(condition.right, ctx);
			break;
		default:
			break;
	}
}

function observe(
	reference: Reference,
	position: Position,
	ctx: Context,
	attributeName?: string
): void {
	const draft = record(reference, ctx);
	if (!draft) return;

	if (position === 'text' || position === 'attribute') draft.usedAsScalar = true;
	if (position === 'collection') draft.isArray = true;

	if (position === 'attribute' && attributeName) {
		const implied = ATTRIBUTE_TYPES[attributeName.toLowerCase()];
		if (implied) draft.attributeType = implied;
	}
}

/** Apply a reference's tags and fallback to its draft. */
function record(reference: Reference, ctx: Context): Draft | null {
	if (reference.isIndex) return null;

	const path = reference.canonicalPath || reference.path;
	const draft = draftAt(ctx.root, path);
	if (!draft) return null;

	if (reference.hasFallback) {
		draft.hasFallback = true;
		draft.fallback = reference.fallback;
	}

	for (const tag of reference.tags) {
		applyTag(tag, draft, path, ctx);
	}

	return draft;
}

function applyTag(tag: Tag, draft: Draft, path: string, ctx: Context): void {
	const type = TYPE_TAGS[tag.name];
	if (type) {
		if (draft.explicitType && draft.explicitType !== type) {
			ctx.issues.push(
				issue(
					'type-conflict',
					ctx.file,
					`\`${path}\` is annotated both \`@${draft.explicitTypeTag}\` and \`@${tag.name}\`.`,
					{ path }
				)
			);
			return;
		}
		draft.explicitType = type;
		draft.explicitTypeTag = tag.name;
		return;
	}

	if (!MODIFIER_TAGS.has(tag.name)) {
		ctx.issues.push(
			issue('unknown-tag', ctx.file, `unknown annotation \`@${tag.name}\` on \`${path}\`.`, {
				path
			})
		);
		return;
	}

	switch (tag.name) {
		case 'required':
			draft.required = true;
			return;

		case 'enum': {
			const options = tag.args.filter((arg): arg is string => typeof arg === 'string');
			if (options.length !== tag.args.length || options.length === 0) {
				ctx.issues.push(
					issue('tag-argument', ctx.file, `\`@enum\` on \`${path}\` needs string values.`, {
						path
					})
				);
				return;
			}
			draft.options = draft.options ? [...new Set([...draft.options, ...options])] : options;
			return;
		}

		case 'label': {
			const [label] = tag.args;
			if (typeof label !== 'string') {
				ctx.issues.push(
					issue('tag-argument', ctx.file, `\`@label\` on \`${path}\` needs a string.`, { path })
				);
				return;
			}
			draft.label = label;
			return;
		}

		case 'min':
		case 'max': {
			const [bound] = tag.args;
			if (typeof bound !== 'number') {
				ctx.issues.push(
					issue('tag-argument', ctx.file, `\`@${tag.name}\` on \`${path}\` needs a number.`, {
						path
					})
				);
				return;
			}
			draft[tag.name] = bound;
			return;
		}

		case 'pattern': {
			const [pattern] = tag.args;
			if (typeof pattern !== 'string') {
				ctx.issues.push(
					issue('tag-argument', ctx.file, `\`@pattern\` on \`${path}\` needs a string.`, { path })
				);
				return;
			}
			try {
				new RegExp(pattern);
			} catch {
				ctx.issues.push(
					issue('tag-argument', ctx.file, `\`@pattern\` on \`${path}\` is not a valid regex.`, {
						path
					})
				);
				return;
			}
			draft.pattern = pattern;
			return;
		}

		default:
			// Unreachable: MODIFIER_TAGS and this switch are kept in step.
			return;
	}
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

interface ResolveContext {
	issues: SchemaIssue[];
	file: string;
}

function resolve(key: string, draft: Draft, path: string, ctx: ResolveContext): PropSchema {
	const type = resolveType(draft, path, ctx);
	const schema: PropSchema = { type, label: draft.label ?? humanizeKey(key) };

	if (draft.required) schema.required = true;
	if (draft.hasFallback) schema.default = draft.fallback;
	if (draft.required && draft.hasFallback) {
		ctx.issues.push(
			issue(
				'required-with-default',
				ctx.file,
				`\`${path}\` is \`@required\` but also has a \`??\` default — a required prop cannot fall back.`,
				{ path }
			)
		);
	}

	if (draft.options) schema.options = draft.options;
	if (draft.min !== undefined) schema.min = draft.min;
	if (draft.max !== undefined) schema.max = draft.max;
	if (draft.pattern !== undefined) schema.pattern = draft.pattern;

	if (type === 'array') {
		const item = draft.item ?? createDraft(key);
		const itemLabel = singularLabel(key);
		schema.items = resolve(key, item, `${path}[]`, ctx);
		schema.items.label = item.label ?? itemLabel;
		schema.itemLabel = itemLabel;
		const fields = schema.items.fields;
		if (fields) {
			schema.summaryField = pickSummaryField(fields);
			schema.imageField = pickField(fields, (field) => field.type === 'image');
		}
		return schema;
	}

	if (draft.children.size > 0) {
		schema.fields = {};
		for (const [childKey, child] of draft.children) {
			schema.fields[childKey] = resolve(childKey, child, `${path}.${childKey}`, ctx);
		}
	}

	return schema;
}

function resolveType(draft: Draft, path: string, ctx: ResolveContext): PropType {
	const structural: PropType | null = draft.isArray
		? 'array'
		: draft.children.size > 0
			? 'object'
			: null;

	if (structural) {
		if (draft.explicitType && draft.explicitType !== structural) {
			ctx.issues.push(
				issue(
					'type-conflict',
					ctx.file,
					`\`${path}\` is annotated \`@${draft.explicitTypeTag}\` but the template uses it as ${
						structural === 'array' ? 'a collection' : 'an object'
					}.`,
					{ path }
				)
			);
		}
		if (draft.usedAsScalar) {
			ctx.issues.push(
				issue(
					'type-conflict',
					ctx.file,
					`\`${path}\` is rendered as a value but the template also uses it as ${
						structural === 'array' ? 'a collection' : 'an object'
					}.`,
					{ path }
				)
			);
		}
		return structural;
	}

	// An explicit tag wins over every inference below. `richtext`/`icon`/`image`
	// are non-scalar yet perfectly legitimate in text and attribute positions —
	// they are rendered, just not escaped as plain text — so `usedAsScalar` is
	// not a contradiction here the way it is for a collection or an object.
	if (draft.explicitType) return draft.explicitType;

	if (draft.options) return 'enum';
	if (draft.attributeType) return draft.attributeType;
	if (draft.usedInCondition && !draft.usedAsScalar) return 'boolean';

	if (draft.hasFallback) {
		if (typeof draft.fallback === 'number') return 'number';
		if (typeof draft.fallback === 'boolean') return 'boolean';
	}

	return 'string';
}

function pickField(
	fields: Record<string, PropSchema>,
	predicate: (field: PropSchema) => boolean
): string | undefined {
	for (const [key, field] of Object.entries(fields)) {
		if (predicate(field)) return key;
	}
	return undefined;
}

/** Keys that name an entry better than "whichever string came first". */
const SUMMARY_KEYS = ['name', 'title', 'label', 'heading', 'headline', 'author', 'question'];

/**
 * Which field titles an entry in the editor's list. Declaration order follows
 * first use in the template, which is not a reliable signal — a `badge` shown
 * above the name would win — so prefer a key that reads like a name.
 */
function pickSummaryField(fields: Record<string, PropSchema>): string | undefined {
	for (const candidate of SUMMARY_KEYS) {
		const field = fields[candidate];
		if (field && TEXTUAL_SUMMARY_TYPES.has(field.type)) return candidate;
	}
	return pickField(fields, (field) => TEXTUAL_SUMMARY_TYPES.has(field.type));
}

const TEXTUAL_SUMMARY_TYPES: ReadonlySet<PropType> = new Set<PropType>([
	'string',
	'richtext',
	'enum'
]);
