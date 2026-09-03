/**
 * The schema layer: read a `.brix` file, get the props it accepts.
 *
 * {@link buildBrikSchema} is the whole public surface. It replaces the authored
 * `fields:` block that briks used to carry — the editor, the page validator and
 * the TypeScript generator all call this instead, and all three therefore see
 * exactly what the markup does.
 */

import { splitFrontmatter } from '../frontmatter.js';
import { analyzeTemplate } from '../template/analyze.js';
import { TemplateSyntaxError } from '../template/expression.js';
import { parseTemplate, type TemplateNode } from '../template/parser.js';
import { humanizeKey } from './labels.js';
import { issue, SchemaError, type BrikSchema, type SchemaIssue } from './types.js';

export * from './types.js';
export { humanizeKey, singularLabel } from './labels.js';
export { validateProps, type ValidateContext } from './validate.js';
export { nearestName } from './names.js';

/** Frontmatter keys a `.brix` file may carry. Everything else is a mistake. */
const BRIK_FRONTMATTER_KEYS = new Set(['title', 'description']);

export interface BuildBrikSchemaOptions {
	/** File path used in diagnostics. */
	file?: string;
	/** The brik's name (its file basename), used as the default title. */
	name?: string;
}

export interface BrikDefinition {
	schema: BrikSchema;
	/** The template body, parsed and ready to render. `null` if it did not parse. */
	nodes: TemplateNode[] | null;
	issues: SchemaIssue[];
}

/**
 * Parse a `.brix` file into its schema and its renderable AST.
 *
 * Never throws: a template that fails to parse comes back with `nodes: null`
 * and a positioned `template-syntax` issue, so a caller can report every
 * problem in a site rather than dying on the first one.
 */
export function buildBrikSchema(
	source: string,
	options: BuildBrikSchemaOptions = {}
): BrikDefinition {
	const file = options.file ?? '<brik>';
	const document = splitFrontmatter(source);
	const issues: SchemaIssue[] = [];

	for (const error of document.issues) {
		issues.push(
			issue('frontmatter-syntax', file, `invalid frontmatter — ${error.message}`, {
				line: error.position.line,
				column: error.position.column
			})
		);
	}

	for (const key of Object.keys(document.data)) {
		if (BRIK_FRONTMATTER_KEYS.has(key)) continue;
		const position = document.positionOfKey(key);
		issues.push(
			issue(
				'unknown-key',
				file,
				`unknown frontmatter key \`${key}\` — a brik's frontmatter carries only \`title\` and \`description\`; everything about its props is annotated in the template.`,
				{ path: key, line: position.line, column: position.column }
			)
		);
	}

	const title = asString(document.data.title) ?? (options.name ? humanizeKey(options.name) : '');
	const description = asString(document.data.description) ?? '';

	let nodes: TemplateNode[] | null = null;
	try {
		nodes = parseTemplate(document.body);
	} catch (error) {
		if (!(error instanceof TemplateSyntaxError)) throw error;
		const position = document.positionAt(document.bodyOffset + error.offset);
		issues.push(
			issue('template-syntax', file, error.message, {
				line: position.line,
				column: position.column
			})
		);
		return { schema: { title, description, props: {} }, nodes: null, issues };
	}

	const analysis = analyzeTemplate(nodes, { file, title, description });
	return { schema: analysis.schema, nodes, issues: [...issues, ...analysis.issues] };
}

/** Build a schema, throwing when anything is wrong. For build-time callers. */
export function compileBrikSchema(
	source: string,
	options: BuildBrikSchemaOptions = {}
): BrikDefinition {
	const definition = buildBrikSchema(source, options);
	if (definition.issues.length > 0) throw new SchemaError(definition.issues);
	return definition;
}

function asString(value: unknown): string | undefined {
	return typeof value === 'string' ? value : undefined;
}
