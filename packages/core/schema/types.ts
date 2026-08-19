/**
 * The shape a brik's props have, and the diagnostics produced when a page does
 * not match it.
 *
 * Nothing here is authored. A `BrikSchema` is *derived* from a template by
 * `template/analyze.ts`: the types come from how each prop is used, refined by
 * the `@tag` annotations written next to it. There is no second document to
 * keep in sync — rename a prop in the markup and the schema, the generated
 * types, and the page errors all move with it.
 *
 * The issue model deliberately mirrors `redirects/types.ts`, which is the
 * repo's existing precedent for build-time diagnostics: a code, a message
 * already prefixed with the file, and enough position to point at the problem.
 */

import type { LiteralValue } from '../template/expression.js';

export type PropType =
	| 'string'
	| 'number'
	| 'boolean'
	| 'date'
	| 'url'
	| 'color'
	| 'image'
	| 'icon'
	| 'richtext'
	| 'json'
	| 'enum'
	| 'object'
	| 'array';

/** Types whose value is a single scalar renderable as text. */
export const SCALAR_TYPES: ReadonlySet<PropType> = new Set<PropType>([
	'string',
	'number',
	'boolean',
	'date',
	'url',
	'color',
	'enum'
]);

/** Types whose value is injected into the page as raw HTML. */
export const RAW_HTML_TYPES: ReadonlySet<PropType> = new Set<PropType>(['richtext', 'icon']);

export interface PropSchema {
	type: PropType;
	/** Human label for the editor. Inferred from the key unless `@label` says otherwise. */
	label: string;
	/** `@required` — the page must supply a value. */
	required?: boolean;
	/** The `??` fallback: both the default value and the editor placeholder. */
	default?: LiteralValue;
	/** `@enum('a','b')` — the closed set of accepted values. */
	options?: string[];
	/** `@min` / `@max`: numeric bounds, or array length bounds. */
	min?: number;
	max?: number;
	/** `@pattern` — a regular expression the string must match. */
	pattern?: string;
	/** For `type: 'object'`. */
	fields?: Record<string, PropSchema>;
	/** For `type: 'array'`. */
	items?: PropSchema;
	/** For `type: 'array'`: singular label of one entry ("Plan"). */
	itemLabel?: string;
	/** For `type: 'array'`: which key of an entry titles it in the editor. */
	summaryField?: string;
	/** For `type: 'array'`: which key of an entry thumbnails it. */
	imageField?: string;
}

export interface BrikSchema {
	/** From the frontmatter `title`, falling back to the brik's name. */
	title: string;
	/** From the frontmatter `description`. */
	description: string;
	props: Record<string, PropSchema>;
}

export type SchemaIssueCode =
	// Authoring a brik
	| 'template-syntax'
	| 'unknown-tag'
	| 'tag-argument'
	| 'type-conflict'
	| 'required-with-default'
	// Authoring a page
	| 'frontmatter-syntax'
	| 'unknown-key'
	| 'unknown-brik'
	| 'unknown-prop'
	| 'missing-required'
	| 'type-mismatch'
	| 'not-in-options'
	| 'constraint';

export interface SchemaIssue {
	code: SchemaIssueCode;
	/** Human-readable, already prefixed with the offending file. */
	message: string;
	file: string;
	/** Dotted path of the prop at fault, when the issue has one. */
	path?: string;
	line?: number;
	column?: number;
}

/**
 * Thrown by the build-time entry points once any issue survives.
 *
 * Same split as the redirect compiler: an `analyze*` function that collects
 * issues without throwing (so the dev server can warn and carry on) and a
 * `compile*`/`assert*` wrapper that throws (so the build stops).
 */
export class SchemaError extends Error {
	readonly issues: SchemaIssue[];

	constructor(issues: SchemaIssue[]) {
		const detail = issues.map((issue) => `  • ${issue.message}`).join('\n');
		const count = issues.length === 1 ? '1 problem' : `${issues.length} problems`;
		super(`${count} found:\n${detail}`);
		this.name = 'SchemaError';
		this.issues = issues;
	}
}

/** Assemble an issue, prefixing the message with file and position. */
export function issue(
	code: SchemaIssueCode,
	file: string,
	message: string,
	options: { path?: string; line?: number; column?: number } = {}
): SchemaIssue {
	const where = options.line === undefined ? file : `${file}:${options.line}:${options.column ?? 1}`;
	return {
		code,
		file,
		message: `${where}: ${message}`,
		path: options.path,
		line: options.line,
		column: options.column
	};
}
