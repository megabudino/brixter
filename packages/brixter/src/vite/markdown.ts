/**
 * Markdown → HTML for a page's body.
 *
 * Kept in the SvelteKit package rather than in `@brixter/core`: the core engine
 * returns the body as written and stays dependency-free apart from `yaml`, and
 * the framework layer decides how prose becomes markup. A different integration
 * is free to hand the body to its own pipeline.
 */

import { marked } from 'marked';

/**
 * Compile a page body. Returns an empty string for an empty body so callers can
 * test `content` for truthiness and skip the wrapper entirely.
 *
 * `async: false` keeps this synchronous, which the Vite `transform` hook needs.
 */
export function renderMarkdown(body: string): string {
	if (!body.trim()) return '';
	return marked.parse(body, { async: false, gfm: true });
}
