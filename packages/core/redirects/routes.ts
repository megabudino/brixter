/**
 * Route-id → matcher translation.
 *
 * At build time the real route manifest comes from the framework (SvelteKit
 * hands adapters `builder.routes`, each entry already carrying a `pattern`), and
 * that is what the compiler should be fed. This helper covers the other case:
 * callers that only have the filesystem — the dev server, an editor — and still
 * need to know which pathnames are already taken.
 *
 * It mirrors SvelteKit's filesystem-routing conventions without importing
 * SvelteKit, the same trade the sitemap's `routeFileToUrl` makes.
 */

/** `[slug]`, `[id=matcher]`, `[[optional]]`, `[...rest]`. */
const PARAM = /\[\[?(?:\.\.\.)?[^\]]*\]\]?/g;
const ROUTE_GROUP = /^\(.+\)$/;
const OPTIONAL = /^\[\[.*\]\]$/;
const REST = /^\[\.\.\..*\]$/;

function escapeRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Turn one route segment into a regex fragment, without its leading slash. */
function segmentToRegex(segment: string): string {
	let result = '';
	let lastIndex = 0;
	PARAM.lastIndex = 0;
	for (let match = PARAM.exec(segment); match; match = PARAM.exec(segment)) {
		result += escapeRegex(segment.slice(lastIndex, match.index));
		// Inside a segment that also has literal text, every param kind is bounded
		// by the segment — only a whole-segment rest param can span slashes.
		result += REST.test(match[0]) ? '.*' : OPTIONAL.test(match[0]) ? '[^/]*' : '[^/]+';
		lastIndex = match.index + match[0].length;
	}
	return result + escapeRegex(segment.slice(lastIndex));
}

/**
 * Build a pathname matcher for a SvelteKit route id (e.g. `/(app)/blog/[slug]`).
 *
 * The pattern tolerates an optional trailing slash so it matches under either
 * trailing-slash policy.
 */
export function routeIdToPattern(id: string): RegExp {
	const segments = id.split('/').filter((segment) => segment !== '' && !ROUTE_GROUP.test(segment));

	if (segments.length === 0) return /^\/$/;

	let source = '';
	for (const segment of segments) {
		if (REST.test(segment)) source += '(?:/.*)?';
		else if (OPTIONAL.test(segment)) source += '(?:/[^/]+)?';
		else source += '/' + segmentToRegex(segment);
	}

	return new RegExp(`^${source}/?$`);
}
