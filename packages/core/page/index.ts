/**
 * The page format: a `.md` file whose frontmatter lists the briks.
 *
 * ```markdown
 * ---
 * metadata:
 *   title: Pricing — Brixter
 *   description: Simple per-seat pricing.
 * layout: Marketing
 * brix:
 *   - type: Hero
 *     props: { headline: Ship pages, not tickets. }
 * ---
 *
 * Prose, compiled to HTML and handed to the layout as `content`.
 * ```
 *
 * The top level is a **closed set** of five keys. That is a deliberate change
 * from the old `.brix.yaml`, where everything that was not `components` or
 * `layout` silently became `<head>` metadata — a rule implemented twice, in two
 * subtly different ways, and which turned a typo like `titel:` into a valid
 * metadata key that rendered nothing. Now `metadata` is explicit and a
 * misspelled key at the top level is an error.
 *
 * Inside `metadata`, unknown keys stay legal on purpose: they are handed to the
 * layout, which is free to read whatever it likes.
 */

import { joinFrontmatter, splitFrontmatter, type Position } from '../frontmatter.js';
import { issue, type SchemaIssue } from '../schema/types.js';
import { stringify as stringifyYaml } from 'yaml';

/** One entry of the page's `brix` list. */
export interface PageBrik {
	type: string;
	props: Record<string, unknown>;
}

export interface PageDocument {
	/** Everything rendered into `<head>`, plus anything the layout wants. */
	metadata: Record<string, unknown>;
	/** Layout component name, resolved against the plugin's `layoutsDir`. */
	layout?: string;
	/** The page's sections, in visual order. */
	brix: PageBrik[];
	/** Old URLs this page answers for, compiled into redirects at build time. */
	aliases?: unknown;
	/** Per-page sitemap control. */
	sitemap?: unknown;
	/** Raw markdown body — compiled to HTML by the framework layer. */
	body: string;
}

export interface ParsedPage {
	page: PageDocument;
	issues: SchemaIssue[];
	/** Position of a frontmatter path, for diagnostics from later stages. */
	positionOf(path: string): Position;
}

/** Top-level frontmatter keys a page may carry. */
export const PAGE_KEYS = ['metadata', 'layout', 'brix', 'aliases', 'sitemap'] as const;

const PAGE_KEY_SET = new Set<string>(PAGE_KEYS);

/**
 * Parse a `.md` page. Never throws — malformed input yields a usable (if empty)
 * document plus the issues explaining why.
 */
export function parsePage(source: string, file = '<page>'): ParsedPage {
	const document = splitFrontmatter(source);
	const issues: SchemaIssue[] = [];
	const at = (path: string) => {
		const position = document.positionOf(path);
		return { line: position.line, column: position.column };
	};
	const atKey = (path: string) => {
		const position = document.positionOfKey(path);
		return { line: position.line, column: position.column };
	};

	for (const error of document.issues) {
		issues.push(
			issue('frontmatter-syntax', file, `invalid frontmatter — ${error.message}`, {
				line: error.position.line,
				column: error.position.column
			})
		);
	}

	for (const key of Object.keys(document.data)) {
		if (PAGE_KEY_SET.has(key)) continue;
		issues.push(
			issue(
				'unknown-key',
				file,
				`unknown page key \`${key}\`. A page carries ${PAGE_KEYS.map((name) => `\`${name}\``).join(
					', '
				)} — everything rendered into \`<head>\` goes under \`metadata\`.`,
				{ path: key, ...atKey(key) }
			)
		);
	}

	const metadata = isRecord(document.data.metadata) ? document.data.metadata : {};
	if (document.data.metadata !== undefined && !isRecord(document.data.metadata)) {
		issues.push(
			issue('type-mismatch', file, '`metadata` must be a mapping.', {
				path: 'metadata',
				...at('metadata')
			})
		);
	}

	const layout = typeof document.data.layout === 'string' ? document.data.layout.trim() : undefined;
	if (document.data.layout !== undefined && layout === undefined) {
		issues.push(
			issue('type-mismatch', file, '`layout` must be the name of a layout component.', {
				path: 'layout',
				...at('layout')
			})
		);
	}

	return {
		page: {
			metadata,
			layout: layout || undefined,
			brix: readBrix(document.data.brix, file, issues, at),
			aliases: document.data.aliases,
			sitemap: document.data.sitemap,
			body: document.body
		},
		issues,
		positionOf: document.positionOf
	};
}

function readBrix(
	value: unknown,
	file: string,
	issues: SchemaIssue[],
	at: (path: string) => { line: number; column: number }
): PageBrik[] {
	if (value === undefined) return [];

	if (!Array.isArray(value)) {
		issues.push(
			issue('type-mismatch', file, '`brix` must be a list of sections.', {
				path: 'brix',
				...at('brix')
			})
		);
		return [];
	}

	const brix: PageBrik[] = [];
	for (const [index, entry] of value.entries()) {
		const path = `brix[${index}]`;
		if (!isRecord(entry)) {
			issues.push(
				issue('type-mismatch', file, `\`${path}\` must be a mapping with a \`type\`.`, {
					path,
					...at(path)
				})
			);
			continue;
		}
		if (typeof entry.type !== 'string' || !entry.type.trim()) {
			issues.push(
				issue('unknown-brik', file, `\`${path}\` is missing a \`type\`.`, {
					path,
					...at(path)
				})
			);
			continue;
		}
		brix.push({
			type: entry.type.trim(),
			props: isRecord(entry.props) ? entry.props : {}
		});
	}
	return brix;
}

/** Write a page back out in the same shape {@link parsePage} reads. */
export function serializePage(page: PageDocument): string {
	const data: Record<string, unknown> = {};
	if (Object.keys(page.metadata).length > 0) data.metadata = page.metadata;
	if (page.layout) data.layout = page.layout;
	if (page.aliases !== undefined) data.aliases = page.aliases;
	if (page.sitemap !== undefined) data.sitemap = page.sitemap;
	data.brix = page.brix.map((brik) => ({ type: brik.type, props: brik.props }));

	return joinFrontmatter(stringifyYaml(data), page.body);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
