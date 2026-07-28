/**
 * Serializers for the hosting layers' native redirect formats.
 *
 * The compiled map is emitted where the platform already looks for it, so
 * redirects are answered by the edge with a real status code — before any
 * application code runs. Nothing here ever produces an HTML page: a meta
 * refresh is not a redirect, it is a page that costs a round trip, loses the
 * status code, and tells search engines nothing.
 */
import type { RedirectRule } from './types.js';

/** Marks the generated block so a rebuild replaces it instead of stacking copies. */
export const REDIRECTS_BANNER = '# brixter:redirects — generated, do not edit';
export const REDIRECTS_BANNER_END = '# brixter:redirects end';

/**
 * The `_redirects` line format, understood by Netlify and Cloudflare Pages:
 * `<from> <to> <status>`, first match wins.
 *
 * Returns the rules wrapped in the banner markers, or an empty string when
 * there is nothing to emit.
 */
export function formatRedirectsFile(rules: readonly RedirectRule[]): string {
	if (rules.length === 0) return '';
	const lines = rules.map((rule) => `${rule.from}  ${rule.to}  ${rule.status}`);
	return [REDIRECTS_BANNER, ...lines, REDIRECTS_BANNER_END, ''].join('\n');
}

/**
 * Replace a previously generated block in an existing `_redirects` file, or
 * prepend it.
 *
 * Prepending is what makes the rules effective: the format is first-match-wins
 * and adapters append a catch-all that would otherwise swallow every path.
 */
export function mergeRedirectsFile(existing: string, block: string): string {
	const withoutBlock = existing.replace(
		new RegExp(`${REDIRECTS_BANNER}[\\s\\S]*?${REDIRECTS_BANNER_END}\\n?`),
		''
	);
	const rest = withoutBlock.replace(/^\n+/, '');
	if (!block) return rest;
	return rest ? `${block}\n${rest}` : block;
}

/** A route entry in Vercel's Build Output API config (`.vercel/output/config.json`). */
export interface VercelRoute {
	src: string;
	headers: { Location: string };
	status: number;
}

function escapeRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Vercel's Build Output API expresses a redirect as a route matched before the
 * filesystem handler. The pattern tolerates a trailing slash so the rule holds
 * under either trailing-slash policy.
 */
export function toVercelRoutes(rules: readonly RedirectRule[]): VercelRoute[] {
	return rules.map((rule) => ({
		src: `^${escapeRegex(rule.from.replace(/\/$/, '') || '/')}/?$`,
		headers: { Location: rule.to },
		status: rule.status
	}));
}
