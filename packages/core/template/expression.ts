/**
 * The expression language inside `{ … }`.
 *
 * Deliberately tiny, and not a subset of JavaScript: a reference is a dotted
 * path, optionally preceded by `@tag` annotations and followed by a `??`
 * fallback. Conditions add `!`, comparison against a literal, and nothing else.
 *
 *   {eyebrow}
 *   {@richtext @required headline ?? 'Simple pricing that scales with you.'}
 *   {@enum('yellow','blue','green') plan.accent ?? 'yellow'}
 *   {#if plan.featured}   {#if plan.tier == 'pro'}   {#if !plan.hidden}
 *
 * The grammar is small on purpose. Everything downstream — the inferred brik
 * schema, the editor's click-to-edit anchors, page validation, generated
 * TypeScript — depends on knowing statically which props a template reads and
 * how. A general expression language would take that away, and the schema would
 * have to be written out by hand again.
 */

/** A literal value that can appear as a `??` fallback or a `@tag` argument. */
export type LiteralValue = string | number | boolean | null;

/** One `@name` or `@name(arg, …)` annotation. */
export interface Tag {
	name: string;
	args: LiteralValue[];
	/** Offset of the `@`, relative to the start of the expression source. */
	offset: number;
}

/** A dotted path read out of the props, with its annotations. */
export interface Reference {
	kind: 'reference';
	/** The path exactly as written — `plan.name`. */
	path: string;
	tags: Tag[];
	/** Value used when the resolved value is null/undefined. */
	fallback: LiteralValue | undefined;
	hasFallback: boolean;
	/**
	 * Alias-free path (`plans[].name`), filled in by the parser's `bind` pass.
	 * Empty until then, and empty for an `{#each … , i}` index binding.
	 */
	canonicalPath: string;
	/** True when this resolves to an `{#each … , i}` index rather than a prop. */
	isIndex: boolean;
}

export interface LiteralExpression {
	kind: 'literal';
	value: LiteralValue;
}

export interface NotExpression {
	kind: 'not';
	operand: Condition;
}

export type CompareOperator = '==' | '!=' | '>' | '<' | '>=' | '<=';

export interface CompareExpression {
	kind: 'compare';
	operator: CompareOperator;
	left: Condition;
	right: Condition;
}

export type Condition = Reference | LiteralExpression | NotExpression | CompareExpression;

/** A malformed expression. Carries an offset so callers can point at it. */
export class TemplateSyntaxError extends Error {
	readonly offset: number;

	constructor(message: string, offset: number) {
		super(message);
		this.name = 'TemplateSyntaxError';
		this.offset = offset;
	}
}

const PATH_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*/;
const IDENT_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*/;
const COMPARE_OPERATORS: CompareOperator[] = ['==', '!=', '>=', '<=', '>', '<'];

/**
 * Parse `@tag* path (?? literal)?` — the form used by an interpolation, an
 * attribute value, a `{@prop …}` declaration, and the collection of an
 * `{#each}`.
 */
export function parseReference(source: string, baseOffset = 0): Reference {
	const cursor = new Cursor(source, baseOffset);
	const reference = readReference(cursor);
	cursor.skipSpace();
	if (!cursor.done()) {
		throw cursor.fail(`unexpected \`${cursor.rest().trim()}\``);
	}
	return reference;
}

/** Parse the condition of an `{#if …}` / `{:else if …}`. */
export function parseCondition(source: string, baseOffset = 0): Condition {
	const cursor = new Cursor(source, baseOffset);
	const condition = readCondition(cursor);
	cursor.skipSpace();
	if (!cursor.done()) {
		throw cursor.fail(`unexpected \`${cursor.rest().trim()}\``);
	}
	return condition;
}

export interface EachHeader {
	collection: Reference;
	alias: string;
	indexAlias?: string;
}

/** Parse the header of an `{#each xs as x}` / `{#each xs as x, i}`. */
export function parseEachHeader(source: string, baseOffset = 0): EachHeader {
	const separator = findAsKeyword(source);
	if (separator === -1) {
		throw new TemplateSyntaxError('`{#each …}` needs an `as` binding', baseOffset);
	}

	const collection = parseReference(source.slice(0, separator), baseOffset);
	const cursor = new Cursor(source.slice(separator + 2), baseOffset + separator + 2);

	cursor.skipSpace();
	const alias = cursor.readPattern(IDENT_PATTERN);
	if (!alias) throw cursor.fail('expected a name after `as`');

	let indexAlias: string | undefined;
	cursor.skipSpace();
	if (cursor.eat(',')) {
		cursor.skipSpace();
		indexAlias = cursor.readPattern(IDENT_PATTERN);
		if (!indexAlias) throw cursor.fail('expected an index name after `,`');
		cursor.skipSpace();
	}

	if (!cursor.done()) throw cursor.fail(`unexpected \`${cursor.rest().trim()}\``);
	return { collection, alias, indexAlias };
}

/**
 * Index of the `as` keyword that separates collection from alias, skipping any
 * that sits inside a string literal (`{#each @enum('as') xs as x}`).
 */
function findAsKeyword(source: string): number {
	let quote: string | null = null;
	for (let index = 0; index < source.length; index += 1) {
		const char = source[index];
		if (quote) {
			if (char === '\\') index += 1;
			else if (char === quote) quote = null;
			continue;
		}
		if (char === '"' || char === "'") {
			quote = char;
			continue;
		}
		if (
			char === 'a' &&
			source[index + 1] === 's' &&
			isBoundary(source[index - 1]) &&
			isBoundary(source[index + 2])
		) {
			return index;
		}
	}
	return -1;
}

function isBoundary(char: string | undefined): boolean {
	return char === undefined || /\s/.test(char);
}

// ---------------------------------------------------------------------------
// Recursive descent
// ---------------------------------------------------------------------------

function readReference(cursor: Cursor): Reference {
	const tags = readTags(cursor);

	cursor.skipSpace();
	const path = cursor.readPattern(PATH_PATTERN);
	if (!path) throw cursor.fail('expected a prop path');

	cursor.skipSpace();
	let fallback: LiteralValue | undefined;
	let hasFallback = false;
	if (cursor.eat('??')) {
		cursor.skipSpace();
		fallback = readLiteral(cursor);
		hasFallback = true;
	}

	return { kind: 'reference', path, tags, fallback, hasFallback, canonicalPath: '', isIndex: false };
}

function readTags(cursor: Cursor): Tag[] {
	const tags: Tag[] = [];
	for (;;) {
		cursor.skipSpace();
		const offset = cursor.offset();
		if (!cursor.eat('@')) return tags;

		const name = cursor.readPattern(IDENT_PATTERN);
		if (!name) throw cursor.fail('expected a tag name after `@`');

		const args: LiteralValue[] = [];
		if (cursor.eat('(')) {
			cursor.skipSpace();
			if (!cursor.eat(')')) {
				for (;;) {
					cursor.skipSpace();
					args.push(readLiteral(cursor));
					cursor.skipSpace();
					if (cursor.eat(',')) continue;
					if (cursor.eat(')')) break;
					throw cursor.fail('expected `,` or `)` in tag arguments');
				}
			}
		}

		tags.push({ name, args, offset });
	}
}

function readCondition(cursor: Cursor): Condition {
	const left = readOperand(cursor);
	cursor.skipSpace();

	for (const operator of COMPARE_OPERATORS) {
		if (cursor.eat(operator)) {
			cursor.skipSpace();
			return { kind: 'compare', operator, left, right: readOperand(cursor) };
		}
	}

	return left;
}

function readOperand(cursor: Cursor): Condition {
	cursor.skipSpace();
	if (cursor.eat('!')) {
		return { kind: 'not', operand: readOperand(cursor) };
	}
	if (cursor.atLiteral()) {
		return { kind: 'literal', value: readLiteral(cursor) };
	}
	return readReference(cursor);
}

function readLiteral(cursor: Cursor): LiteralValue {
	const quote = cursor.peek();
	if (quote === "'" || quote === '"') return cursor.readString(quote);
	if (cursor.eatWord('true')) return true;
	if (cursor.eatWord('false')) return false;
	if (cursor.eatWord('null')) return null;

	const number = cursor.readPattern(/^-?\d+(?:\.\d+)?/);
	if (number !== '') return Number(number);

	throw cursor.fail('expected a literal value');
}

// ---------------------------------------------------------------------------
// Cursor
// ---------------------------------------------------------------------------

class Cursor {
	private readonly source: string;
	private readonly base: number;
	private index = 0;

	constructor(source: string, base: number) {
		this.source = source;
		this.base = base;
	}

	offset(): number {
		return this.base + this.index;
	}

	done(): boolean {
		return this.index >= this.source.length;
	}

	rest(): string {
		return this.source.slice(this.index);
	}

	peek(): string | undefined {
		return this.source[this.index];
	}

	skipSpace(): void {
		while (this.index < this.source.length && /\s/.test(this.source[this.index])) this.index += 1;
	}

	eat(token: string): boolean {
		if (!this.source.startsWith(token, this.index)) return false;
		this.index += token.length;
		return true;
	}

	/** Like {@link eat}, but only when the token is not glued to an identifier. */
	eatWord(word: string): boolean {
		if (!this.source.startsWith(word, this.index)) return false;
		const next = this.source[this.index + word.length];
		if (next !== undefined && /[A-Za-z0-9_$]/.test(next)) return false;
		this.index += word.length;
		return true;
	}

	readPattern(pattern: RegExp): string {
		const match = pattern.exec(this.source.slice(this.index));
		if (!match) return '';
		this.index += match[0].length;
		return match[0];
	}

	atLiteral(): boolean {
		const char = this.peek();
		if (char === undefined) return false;
		if (char === "'" || char === '"' || char === '-' || /\d/.test(char)) return true;
		return (
			this.source.startsWith('true', this.index) ||
			this.source.startsWith('false', this.index) ||
			this.source.startsWith('null', this.index)
		);
	}

	readString(quote: string): string {
		this.index += 1;
		let out = '';
		while (this.index < this.source.length) {
			const char = this.source[this.index];
			if (char === '\\') {
				out += this.source[this.index + 1] ?? '';
				this.index += 2;
				continue;
			}
			if (char === quote) {
				this.index += 1;
				return out;
			}
			out += char;
			this.index += 1;
		}
		throw this.fail('unterminated string literal');
	}

	fail(message: string): TemplateSyntaxError {
		return new TemplateSyntaxError(message, this.offset());
	}
}
