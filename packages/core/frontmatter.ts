/**
 * YAML frontmatter: split, parse, and locate.
 *
 * Every authored Brixter file is a `---` block followed by a body — a `.md`
 * page (metadata + `brix` list, then markdown prose) or a `.brix` brik (title +
 * description, then the template). This module is the single reader for that
 * shape; before it existed the repo carried three partial implementations that
 * only ever *stripped* the block.
 *
 * Beyond parsing it answers "where is this?", which is what turns a validation
 * failure into a diagnostic a person can act on. {@link positionAt} maps any
 * offset in the original source to a 1-based line/column, and
 * {@link FrontmatterDocument.positionOf} resolves a dotted path
 * (`brix[0].props.headline`) to the position of that YAML node — so an error
 * about a prop points at the prop, not at the top of the file.
 */

import { parseDocument, type Document } from 'yaml';

/** A 1-based position in a source file. */
export interface Position {
	line: number;
	column: number;
	/** Absolute offset into the original source. */
	offset: number;
}

/** A frontmatter block that could not be parsed. */
export interface FrontmatterIssue {
	message: string;
	position: Position;
}

export interface FrontmatterDocument {
	/** Parsed mapping. Always an object — `{}` when there is no frontmatter. */
	data: Record<string, unknown>;
	/** Everything after the closing fence. */
	body: string;
	/** Offset of {@link body} within the original source. */
	bodyOffset: number;
	/** True when the source actually opened with a `---` fence. */
	present: boolean;
	/**
	 * True when the source opened a `---` fence that is never closed. Treating
	 * that as "no frontmatter" would silently discard everything the author
	 * wrote, so callers report it instead.
	 */
	unterminated: boolean;
	/** YAML syntax errors, already positioned against the original source. */
	issues: FrontmatterIssue[];
	/** 1-based position of an absolute offset in the original source. */
	positionAt(offset: number): Position;
	/**
	 * Position of the value at a dotted/bracketed path (`brix[0].props.title`).
	 * Falls back to the nearest resolvable ancestor, so a path pointing at a key
	 * that does not exist still lands near where it should have been. Returns the
	 * start of the file when nothing resolves.
	 */
	positionOf(path: string): Position;
	/**
	 * Position of the *key* at a path rather than its value. An unknown-key
	 * diagnostic should point at the key the author typed, not at the first line
	 * of the block underneath it.
	 */
	positionOfKey(path: string): Position;
}

const FRONTMATTER_PATTERN = /^(---[ \t]*\r?\n)([\s\S]*?)(?:\r?\n)?^---[ \t]*(?:\r?\n|$)/m;

/**
 * Split a source file into its frontmatter data and body.
 *
 * A source with no leading `---` fence is treated as all body with empty data,
 * never as an error: a brik with no metadata is legal.
 */
export function splitFrontmatter(source: string): FrontmatterDocument {
	const lineStarts = indexLines(source);
	const positionAt = (offset: number): Position => resolvePosition(lineStarts, source, offset);

	const opened = /^---[ \t]*\r?\n/.test(source);
	const match = opened ? FRONTMATTER_PATTERN.exec(source) : null;
	if (!match) {
		return {
			data: {},
			body: source,
			bodyOffset: 0,
			present: false,
			unterminated: opened,
			issues: opened
				? [{ message: 'unterminated frontmatter block — add a closing `---`', position: positionAt(0) }]
				: [],
			positionAt,
			positionOf: () => positionAt(0),
			positionOfKey: () => positionAt(0)
		};
	}

	// Offset of the YAML text itself: past the opening fence and its newline.
	const yamlOffset = match[1].length;
	const yamlText = match[2];
	const bodyOffset = match[0].length;

	const doc = parseDocument(yamlText, { keepSourceTokens: false });
	const issues: FrontmatterIssue[] = doc.errors.map((error) => ({
		message: error.message,
		position: positionAt(yamlOffset + (error.pos?.[0] ?? 0))
	}));

	const parsed = doc.errors.length > 0 ? null : (doc.toJS() as unknown);

	return {
		data: isRecord(parsed) ? parsed : {},
		body: source.slice(bodyOffset),
		bodyOffset,
		present: true,
		unterminated: false,
		issues,
		positionAt,
		positionOf(path) {
			const offset = nodeOffset(doc, path);
			return positionAt(offset === undefined ? yamlOffset : yamlOffset + offset);
		},
		positionOfKey(path) {
			const offset = keyOffset(doc, path) ?? nodeOffset(doc, path);
			return positionAt(offset === undefined ? yamlOffset : yamlOffset + offset);
		}
	};
}

/**
 * Re-emit a `---` block plus body. Used when writing a page back to disk (the
 * editor's save path); round-trips through the same shape `splitFrontmatter`
 * reads.
 */
export function joinFrontmatter(yamlText: string, body: string): string {
	const frontmatter = `---\n${yamlText.replace(/\n*$/, '')}\n---\n`;
	if (!body.trim()) return frontmatter;
	return `${frontmatter}\n${body.replace(/^\n+/, '')}`;
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

/**
 * Split a path into YAML node keys. `brix[0].props.cta.href` →
 * `['brix', 0, 'props', 'cta', 'href']`. Array indices become numbers so
 * `Document.getIn` can address sequence items.
 */
export function splitPath(path: string): Array<string | number> {
	const segments: Array<string | number> = [];
	for (const part of path.split('.')) {
		if (!part) continue;
		const bracket = part.indexOf('[');
		if (bracket === -1) {
			segments.push(part);
			continue;
		}
		const head = part.slice(0, bracket);
		if (head) segments.push(head);
		for (const index of part.slice(bracket).matchAll(/\[(\d*)\]/g)) {
			// `[]` (no index) is the schema's "any item" marker; address the first
			// entry so a diagnostic still points inside the collection.
			segments.push(index[1] ? Number(index[1]) : 0);
		}
	}
	return segments;
}

/** Start offset of the key naming the last segment of `path`. */
function keyOffset(doc: Document, path: string): number | undefined {
	const segments = splitPath(path);
	const last = segments[segments.length - 1];
	if (typeof last !== 'string') return undefined;

	const parent = segments.length === 1 ? doc.contents : doc.getIn(segments.slice(0, -1), true);
	const items = (parent as { items?: unknown[] } | null | undefined)?.items;
	if (!Array.isArray(items)) return undefined;

	for (const item of items) {
		const pair = item as { key?: { value?: unknown; range?: [number, number, number] } };
		if (pair.key?.value === last) return pair.key.range?.[0];
	}
	return undefined;
}

/** Start offset of the node at `path`, falling back to the nearest ancestor. */
function nodeOffset(doc: Document, path: string): number | undefined {
	const segments = splitPath(path);
	for (let depth = segments.length; depth >= 0; depth -= 1) {
		const node = depth === 0 ? doc.contents : doc.getIn(segments.slice(0, depth), true);
		const range = (node as { range?: [number, number, number] } | null | undefined)?.range;
		if (range) return range[0];
	}
	return undefined;
}

// ---------------------------------------------------------------------------
// Positions
// ---------------------------------------------------------------------------

/** Offsets at which each line starts, for binary-searching a position. */
function indexLines(source: string): number[] {
	const starts = [0];
	for (let index = 0; index < source.length; index += 1) {
		if (source[index] === '\n') starts.push(index + 1);
	}
	return starts;
}

function resolvePosition(lineStarts: number[], source: string, offset: number): Position {
	const clamped = Math.max(0, Math.min(offset, source.length));
	let low = 0;
	let high = lineStarts.length - 1;
	while (low < high) {
		const mid = (low + high + 1) >> 1;
		if (lineStarts[mid] <= clamped) low = mid;
		else high = mid - 1;
	}
	return { line: low + 1, column: clamped - lineStarts[low] + 1, offset: clamped };
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
