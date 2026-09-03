/**
 * Check a page's props against the schema inferred from a brik's template.
 *
 * This is where the two halves of a Brixter site are made to agree. Before it
 * existed, a mistyped prop was ignored, a missing one rendered empty, and a
 * misspelled brik made the whole section disappear — all in silence.
 *
 * Following the redirect compiler's precedent, nothing here throws:
 * {@link validateProps} returns every issue it finds so the dev server can warn
 * and keep serving, and the build's own wrapper decides to stop.
 */

import { nearestName } from './names.js';
import { issue, type BrikSchema, type PropSchema, type SchemaIssue } from './types.js';

export interface ValidateContext {
	/** File the props were read from, for the diagnostic. */
	file: string;
	/** Path prefix used to locate a prop in the source (`brix[0].props`). */
	basePath?: string;
	/** Resolve a dotted path to a position in the source file. */
	locate?: (path: string) => { line: number; column: number } | undefined;
}

/** Validate a `props` mapping against a brik's schema. */
export function validateProps(
	props: unknown,
	schema: BrikSchema,
	ctx: ValidateContext
): SchemaIssue[] {
	const issues: SchemaIssue[] = [];

	if (props !== undefined && !isRecord(props)) {
		issues.push(report(ctx, 'type-mismatch', '', '`props` must be a mapping.'));
		return issues;
	}

	checkFields(props ?? {}, schema.props, '', ctx, issues);
	return issues;
}

function checkFields(
	value: Record<string, unknown>,
	fields: Record<string, PropSchema>,
	prefix: string,
	ctx: ValidateContext,
	issues: SchemaIssue[]
): void {
	for (const [key, entry] of Object.entries(value)) {
		const field = fields[key];
		const path = join(prefix, key);
		if (!field) {
			issues.push(
				report(
					ctx,
					'unknown-prop',
					path,
					`\`${path}\` is not used by this brik.${suggest(key, Object.keys(fields))}`
				)
			);
			continue;
		}
		checkValue(entry, field, path, ctx, issues);
	}

	for (const [key, field] of Object.entries(fields)) {
		if (!field.required) continue;
		if (isPresent(value[key])) continue;
		const path = join(prefix, key);
		issues.push(report(ctx, 'missing-required', path, `\`${path}\` is required but missing.`));
	}
}

function checkValue(
	value: unknown,
	field: PropSchema,
	path: string,
	ctx: ValidateContext,
	issues: SchemaIssue[]
): void {
	// An explicit null clears a prop back to its default; that is not a type error.
	if (value === null || value === undefined) return;

	switch (field.type) {
		case 'array': {
			if (!Array.isArray(value)) {
				issues.push(mismatch(ctx, path, 'a list', value));
				return;
			}
			checkBounds(value.length, field, path, ctx, issues, 'entries');
			if (!field.items) return;
			for (const [index, entry] of value.entries()) {
				checkValue(entry, field.items, `${path}[${index}]`, ctx, issues);
			}
			return;
		}

		case 'object': {
			if (!isRecord(value)) {
				issues.push(mismatch(ctx, path, 'a mapping', value));
				return;
			}
			checkFields(value, field.fields ?? {}, path, ctx, issues);
			return;
		}

		case 'enum': {
			if (typeof value !== 'string') {
				issues.push(mismatch(ctx, path, 'text', value));
				return;
			}
			const options = field.options ?? [];
			if (!options.includes(value)) {
				issues.push(
					report(
						ctx,
						'not-in-options',
						path,
						`\`${path}\` is \`${value}\`, but this brik accepts only ${options
							.map((option) => `\`${option}\``)
							.join(', ')}.`
					)
				);
			}
			return;
		}

		case 'number': {
			if (typeof value !== 'number') {
				issues.push(mismatch(ctx, path, 'a number', value));
				return;
			}
			checkBounds(value, field, path, ctx, issues);
			return;
		}

		case 'boolean': {
			if (typeof value !== 'boolean') issues.push(mismatch(ctx, path, 'true or false', value));
			return;
		}

		case 'json':
			// Structured data passed through verbatim — any shape is legal.
			return;

		default: {
			if (typeof value !== 'string') {
				issues.push(mismatch(ctx, path, 'text', value));
				return;
			}
			checkBounds(value.length, field, path, ctx, issues, 'characters');
			if (field.pattern && !new RegExp(field.pattern).test(value)) {
				issues.push(
					report(
						ctx,
						'constraint',
						path,
						`\`${path}\` does not match the required pattern \`${field.pattern}\`.`
					)
				);
			}
		}
	}
}

function checkBounds(
	measured: number,
	field: PropSchema,
	path: string,
	ctx: ValidateContext,
	issues: SchemaIssue[],
	unit?: string
): void {
	const describe = (bound: number) => (unit ? `${bound} ${unit}` : String(bound));

	if (field.min !== undefined && measured < field.min) {
		issues.push(
			report(ctx, 'constraint', path, `\`${path}\` must be at least ${describe(field.min)}.`)
		);
	}
	if (field.max !== undefined && measured > field.max) {
		issues.push(
			report(ctx, 'constraint', path, `\`${path}\` must be at most ${describe(field.max)}.`)
		);
	}
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function mismatch(
	ctx: ValidateContext,
	path: string,
	expected: string,
	value: unknown
): SchemaIssue {
	return report(
		ctx,
		'type-mismatch',
		path,
		`\`${path}\` expects ${expected}, but got ${describeValue(value)}.`
	);
}

function report(
	ctx: ValidateContext,
	code: SchemaIssue['code'],
	path: string,
	message: string
): SchemaIssue {
	const full = ctx.basePath ? join(ctx.basePath, path) : path;
	const position = ctx.locate?.(full);
	return issue(code, ctx.file, message, {
		path: full,
		line: position?.line,
		column: position?.column
	});
}

function describeValue(value: unknown): string {
	if (Array.isArray(value)) return 'a list';
	if (isRecord(value)) return 'a mapping';
	if (typeof value === 'string') return 'text';
	if (typeof value === 'number') return 'a number';
	if (typeof value === 'boolean') return 'true or false';
	return String(value);
}

/** "Did you mean" for a prop that is one small edit away from a real one. */
function suggest(key: string, candidates: string[]): string {
	const near = nearestName(key, candidates);
	return near ? ` Did you mean \`${near}\`?` : '';
}

function join(prefix: string, key: string): string {
	return prefix ? `${prefix}.${key}` : key;
}

/** Present enough to satisfy `@required`: not null, undefined, or empty text. */
function isPresent(value: unknown): boolean {
	return value !== null && value !== undefined && value !== '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
