/**
 * Path normalization for redirect rules.
 *
 * Aliases and destinations are authored by hand, so they arrive in whatever
 * shape felt natural — `old-pricing`, `/old-pricing/`, `//old//pricing`. They
 * are compared against each other and against the route manifest, and emitted
 * into line-oriented hosting formats, so they have to be reduced to one
 * canonical spelling first.
 */

/** A destination that leaves the site: emitted as-is, never resolved or chained. */
const EXTERNAL = /^https?:\/\//i;

/** SvelteKit route syntax. Concrete paths cannot contain it. */
const DYNAMIC_SEGMENT = /[[\]]/;

export type PathResult = { ok: true; path: string } | { ok: false; reason: string };

export interface NormalizePathOptions {
	trailingSlash?: 'never' | 'always';
}

/** Whether a destination points outside the site. */
export function isExternalDestination(value: string): boolean {
	return EXTERNAL.test(value.trim());
}

/**
 * Reduce an authored path to its canonical root-relative form.
 *
 * Rejects anything that cannot be served as a plain pathname: absolute URLs,
 * whitespace (which is a field separator in `_redirects`), query strings and
 * fragments (not expressible across hosting formats), `..` traversal, and
 * SvelteKit dynamic segments.
 */
export function normalizeRedirectPath(value: unknown, opts: NormalizePathOptions = {}): PathResult {
	if (typeof value !== 'string') return { ok: false, reason: 'must be a string' };

	const raw = value.trim();
	if (!raw) return { ok: false, reason: 'must not be empty' };
	if (EXTERNAL.test(raw)) return { ok: false, reason: 'must be a root-relative path, not a URL' };
	if (/\s/.test(raw)) return { ok: false, reason: 'must not contain whitespace' };
	if (/[?#]/.test(raw)) return { ok: false, reason: 'must not contain a query string or fragment' };
	if (DYNAMIC_SEGMENT.test(raw)) {
		return {
			ok: false,
			reason: 'must be a concrete path — dynamic route segments cannot be matched or redirected to'
		};
	}

	const segments = raw.split('/').filter((segment) => segment !== '' && segment !== '.');
	if (segments.some((segment) => segment === '..')) {
		return { ok: false, reason: 'must not contain `..`' };
	}

	if (segments.length === 0) return { ok: true, path: '/' };
	const path = '/' + segments.join('/');
	return { ok: true, path: (opts.trailingSlash ?? 'never') === 'always' ? path + '/' : path };
}

/**
 * Normalize a destination, which — unlike an alias — may leave the site.
 * External URLs pass through untouched apart from trimming.
 */
export function normalizeDestination(value: unknown, opts: NormalizePathOptions = {}): PathResult {
	if (typeof value === 'string' && isExternalDestination(value)) {
		const url = value.trim();
		if (/\s/.test(url)) return { ok: false, reason: 'must not contain whitespace' };
		return { ok: true, path: url };
	}
	return normalizeRedirectPath(value, opts);
}
