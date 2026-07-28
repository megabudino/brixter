/**
 * Read redirect declarations out of page metadata.
 *
 * A page that replaced an old URL owns that URL's redirect: it declares the old
 * path in an `aliases` field, next to the content that answers for it. Deleting
 * the page deletes its redirects, which is the point of keeping them here
 * instead of in a table someone has to remember to prune.
 *
 *     title: Pricing
 *     aliases:
 *       - /plans                      # 301, the default
 *       - path: /old-pricing          # long-form, when the status matters
 *         status: 302
 *
 * Like `extractSitemapMeta`, this is a plain-object mapper over the metadata the
 * `.brix.yaml` compiler already exposes — not a second parser.
 */
import type { DeclaredRedirect, RedirectSource } from './types.js';

/** One `aliases` entry, normalized to long form. `status` is left unvalidated here. */
export interface DeclaredAlias {
	path: unknown;
	status?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

/**
 * Pull the `aliases` entries out of a page's metadata.
 *
 * Accepts a single string, a list of strings, and the long form. Entries that
 * are neither are kept with an unusable `path`, so the compiler reports them
 * against their file rather than silently dropping a redirect an author wrote.
 */
export function extractAliases(metadata: unknown): DeclaredAlias[] {
	if (!isRecord(metadata)) return [];
	const aliases = metadata.aliases;
	if (aliases === undefined || aliases === null) return [];

	const entries = Array.isArray(aliases) ? aliases : [aliases];
	return entries.map((entry) => {
		if (isRecord(entry)) {
			// `from` reads naturally too, and matches the central-file wording.
			const path = 'path' in entry ? entry.path : entry.from;
			return { path, status: entry.status };
		}
		return { path: entry };
	});
}

/** A page as seen by the alias reader: where it lives, what it serves, what it declares. */
export interface AliasPage {
	/** Project-relative path of the page file. Diagnostics point here. */
	file: string;
	/**
	 * The page's own URL — the destination its aliases redirect to. Pass the
	 * route id for a page with no single static URL: the compiler rejects it
	 * with a message naming the file.
	 */
	url: string;
	metadata: unknown;
}

/**
 * Build the redirect source backed by page `aliases`.
 *
 * One of possibly several sources handed to the compiler — a central project
 * file for redirects whose destination is not a page will be another.
 */
export function pageAliasSource(pages: AliasPage[], name = 'page aliases'): RedirectSource {
	const rules: DeclaredRedirect[] = [];
	for (const page of pages) {
		for (const alias of extractAliases(page.metadata)) {
			const rule: DeclaredRedirect = {
				// Kept raw: normalization and its diagnostics belong to the compiler,
				// so every source reports malformed paths the same way.
				from: alias.path as string,
				to: page.url,
				file: page.file
			};
			// Passed through unvalidated on purpose: an unusable status has to be
			// reported against its file, not quietly replaced by the default.
			if (alias.status !== undefined) rule.status = alias.status as number;
			rules.push(rule);
		}
	}
	return { name, rules };
}
