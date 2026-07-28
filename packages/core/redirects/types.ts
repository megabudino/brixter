/**
 * Framework-agnostic redirect model.
 *
 * A redirect is declared somewhere (a page's `aliases`, later a central project
 * file) and compiled into a flat, ordered map that a hosting layer can serve
 * with a real status code. These types describe that pipeline without any
 * knowledge of SvelteKit, Vite or the DOM.
 */

/** The status codes a redirect rule may carry. `301` is the default. */
export type RedirectStatus = 301 | 302 | 303 | 307 | 308;

export const REDIRECT_STATUSES: ReadonlySet<number> = new Set([301, 302, 303, 307, 308]);

/**
 * One rule as written by an author, before validation.
 *
 * `file` is the project-relative path of the file that contains the rule. It is
 * required — every diagnostic the compiler emits points back at it, so a broken
 * redirect is traceable to the line an author has to fix.
 */
export interface DeclaredRedirect {
	from: string;
	to: string;
	status?: number;
	file: string;
}

/**
 * A named provider of rules.
 *
 * The compiler takes a *list* of these. Today the only one is the site's page
 * `aliases`; a central project file for redirects whose destination is not site
 * content is meant to arrive as one more entry in that list, not as a rewrite.
 */
export interface RedirectSource {
	/** Label used in diagnostics, e.g. `page aliases`. */
	name: string;
	rules: DeclaredRedirect[];
}

/**
 * A route the app already serves, as a matcher over URL pathnames.
 *
 * Shaped to accept SvelteKit's `RouteDefinition` (from `builder.routes`)
 * verbatim, so the build feeds the real route manifest straight in.
 */
export interface KnownRoute {
	/** Route id, e.g. `/blog/[slug]` — used in collision messages. */
	id: string;
	/** Matches the pathnames this route handles. */
	pattern: RegExp;
}

/** A compiled, validated, chain-free redirect. */
export interface RedirectRule {
	/** Normalized source path, always root-relative. */
	from: string;
	/** Normalized destination: a root-relative path, or an absolute external URL. */
	to: string;
	status: RedirectStatus;
	/** File that declared this rule — the first hop, when a chain was flattened. */
	file: string;
	/** Name of the source that provided the rule. */
	source: string;
	/** Alias hops removed by flattening, in order. Empty for a direct rule. */
	via: string[];
}

export type RedirectIssueCode =
	/** Malformed path, unusable status, dynamic segment in a destination. */
	| 'invalid-rule'
	/** The same alias is claimed by two rules. */
	| 'duplicate-alias'
	/** The alias shadows a route the app already serves. */
	| 'route-collision'
	/** The destination is neither a known route nor another alias. */
	| 'unresolved-destination'
	/** The alias chain loops back on itself. */
	| 'cycle';

/** A single reason a redirect cannot be compiled. Always carries its file. */
export interface RedirectIssue {
	code: RedirectIssueCode;
	/** Human-readable, already prefixed with the offending file. */
	message: string;
	file: string;
	from: string;
	source: string;
}

export interface CompileRedirectsInput {
	/** Rule providers, in precedence-neutral order — conflicts are errors, not overrides. */
	sources: RedirectSource[];
	/** The app's route manifest. Used for collision and destination checks. */
	routes?: KnownRoute[];
	/**
	 * Literal pathnames known to exist beyond the route manifest — prerendered
	 * pages, files in the static directory. Valid destinations, and collisions.
	 */
	knownPaths?: string[];
	/** Trailing-slash policy applied to every path. Defaults to `'never'`. */
	trailingSlash?: 'never' | 'always';
	/** Status used when a rule does not name one. Defaults to `301`. */
	defaultStatus?: RedirectStatus;
}

export interface RedirectAnalysis {
	/** Compiled rules. Populated even when `issues` is non-empty (the rules that survived). */
	redirects: RedirectRule[];
	issues: RedirectIssue[];
}
