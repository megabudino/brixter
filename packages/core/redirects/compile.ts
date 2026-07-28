/**
 * The redirect compiler.
 *
 * Takes a list of rule sources and the routes the app already serves, and
 * produces one flat, deterministically ordered map. Every inconsistency it can
 * see is an error, not a warning: a redirect that points nowhere, shadows a real
 * page, or loops is a broken URL in production, and the build is the last place
 * it can be caught cheaply. Each diagnostic names the file holding the rule.
 *
 * Chains are flattened so the hosting layer answers in one hop — `/a → /b → /c`
 * ships as `/a → /c` and `/b → /c`. The status of a flattened rule is the one
 * its own author declared; the hops it passed through only decide where it ends
 * up, not how it answers.
 */
import { isExternalDestination, normalizeDestination, normalizeRedirectPath } from './path.js';
import {
	REDIRECT_STATUSES,
	type CompileRedirectsInput,
	type DeclaredRedirect,
	type KnownRoute,
	type RedirectAnalysis,
	type RedirectIssue,
	type RedirectIssueCode,
	type RedirectRule,
	type RedirectStatus
} from './types.js';

/** Thrown by `compileRedirects` when any rule is inconsistent. */
export class RedirectCompileError extends Error {
	readonly issues: RedirectIssue[];

	constructor(issues: RedirectIssue[]) {
		const detail = issues.map((issue) => `  • ${issue.message}`).join('\n');
		const count = issues.length === 1 ? '1 redirect' : `${issues.length} redirects`;
		super(`${count} could not be compiled:\n${detail}`);
		this.name = 'RedirectCompileError';
		this.issues = issues;
	}
}

/** A rule that survived normalization, with its declaration kept for diagnostics. */
interface StagedRule {
	from: string;
	to: string;
	status: RedirectStatus;
	external: boolean;
	file: string;
	source: string;
}

/** A route id with no dynamic segment serves exactly one URL. */
const DYNAMIC_ROUTE = /[[\]]/;

function matchRoute(path: string, routes: readonly KnownRoute[]): KnownRoute | undefined {
	// A pattern may be a global regex (SvelteKit's are not, but a caller's could
	// be), whose `lastIndex` would make `test` stateful across calls.
	return routes.find((route) => {
		route.pattern.lastIndex = 0;
		return route.pattern.test(path);
	});
}

/** Compare paths for the emitted order: stable, diff-friendly, host-independent. */
function byPath(a: { from: string; to: string }, b: { from: string; to: string }): number {
	// Aliases are literal paths and duplicates are a hard error, so no rule can
	// shadow another and specificity ordering buys nothing. Plain lexicographic
	// order is enough, and keeps the emitted file readable and diff-stable.
	if (a.from !== b.from) return a.from < b.from ? -1 : 1;
	return a.to < b.to ? -1 : a.to > b.to ? 1 : 0;
}

/**
 * Compile without throwing: returns the rules that are valid alongside every
 * issue found. Use this where reporting matters more than stopping — a dev
 * server, an editor. The build should use `compileRedirects`.
 */
export function analyzeRedirects(input: CompileRedirectsInput): RedirectAnalysis {
	const { sources, routes = [], knownPaths = [], trailingSlash, defaultStatus = 301 } = input;
	const issues: RedirectIssue[] = [];
	const opts = { trailingSlash };

	const known = new Set<string>();
	for (const path of knownPaths) {
		const normalized = normalizeRedirectPath(path, opts);
		if (normalized.ok) known.add(normalized.path);
	}

	const report = (
		code: RedirectIssueCode,
		rule: Pick<DeclaredRedirect, 'file' | 'from'>,
		source: string,
		message: string
	) => {
		issues.push({
			code,
			file: rule.file,
			from: String(rule.from),
			source,
			message: `${rule.file}: ${message}`
		});
	};

	// ---- stage 1: normalize, and drop anything malformed -------------------
	const staged: StagedRule[] = [];
	const claimed = new Map<string, StagedRule>();

	for (const source of sources) {
		for (const rule of source.rules) {
			const from = normalizeRedirectPath(rule.from, opts);
			if (!from.ok) {
				report('invalid-rule', rule, source.name, `alias \`${String(rule.from)}\` ${from.reason}`);
				continue;
			}

			const to = normalizeDestination(rule.to, opts);
			if (!to.ok) {
				report(
					'invalid-rule',
					rule,
					source.name,
					`destination \`${String(rule.to)}\` of alias \`${from.path}\` ${to.reason}`
				);
				continue;
			}

			const status = rule.status ?? defaultStatus;
			if (!REDIRECT_STATUSES.has(status)) {
				report(
					'invalid-rule',
					rule,
					source.name,
					`alias \`${from.path}\` has status \`${String(rule.status)}\` — expected one of ${[...REDIRECT_STATUSES].join(', ')}`
				);
				continue;
			}

			// ---- an alias may be claimed once, across every source -------------
			const existing = claimed.get(from.path);
			if (existing) {
				report(
					'duplicate-alias',
					rule,
					source.name,
					`alias \`${from.path}\` is already claimed by ${existing.file}` +
						(existing.to === to.path ? '' : ` (which points it at \`${existing.to}\`)`)
				);
				continue;
			}

			const stagedRule: StagedRule = {
				from: from.path,
				to: to.path,
				status: status as RedirectStatus,
				external: isExternalDestination(to.path),
				file: rule.file,
				source: source.name
			};
			claimed.set(from.path, stagedRule);
			staged.push(stagedRule);
		}
	}

	// ---- stage 2: an alias may not shadow something the app already serves ---
	// Only concrete routes count. A dynamic route *could* match the alias, but
	// its match is a guess about content that may not exist, while the alias is
	// an author's statement that the URL moved — and on a site with a catch-all
	// route, treating that as a collision would forbid redirects entirely.
	const staticRoutes = routes.filter((route) => !DYNAMIC_ROUTE.test(route.id));
	const shadowing = new Set<string>();
	for (const rule of staged) {
		if (known.has(rule.from)) {
			shadowing.add(rule.from);
			report(
				'route-collision',
				rule,
				rule.source,
				`alias \`${rule.from}\` collides with an existing path — it is already served by the site`
			);
			continue;
		}
		const route = matchRoute(rule.from, staticRoutes);
		if (route) {
			shadowing.add(rule.from);
			report(
				'route-collision',
				rule,
				rule.source,
				`alias \`${rule.from}\` collides with the existing route \`${route.id}\``
			);
		}
	}

	// ---- stage 3: every destination must resolve ----------------------------
	// A destination is valid if it leaves the site, is served by a route, is a
	// known path, or is another alias — the last case is a chain, flattened next.
	const unresolved = new Set<string>();
	for (const rule of staged) {
		if (rule.external || claimed.has(rule.to)) continue;
		if (known.has(rule.to) || matchRoute(rule.to, routes)) continue;
		unresolved.add(rule.from);
		report(
			'unresolved-destination',
			rule,
			rule.source,
			`alias \`${rule.from}\` points at \`${rule.to}\`, which no route, page or alias resolves to`
		);
	}

	// ---- stage 4: flatten chains, refusing cycles ---------------------------
	const redirects: RedirectRule[] = [];
	const broken = new Set([...shadowing, ...unresolved]);

	for (const rule of staged) {
		if (broken.has(rule.from)) continue;

		const via: string[] = [];
		const seen = new Set<string>([rule.from]);
		let current = rule;
		let unusable = false;

		while (!current.external) {
			const next = claimed.get(current.to);
			if (!next) break; // resolved in stage 3: a real route, page or asset
			if (seen.has(next.from)) {
				const loop = [...seen, next.from];
				// The rule that closes the loop is rarely the one at fault; name the
				// other hops and where they live so the author can see the whole ring.
				const elsewhere = [...new Set(loop)]
					.map((path) => claimed.get(path))
					.filter(
						(hop): hop is StagedRule => !!hop && hop.from !== rule.from && hop.file !== rule.file
					)
					.map((hop) => `\`${hop.from}\` in ${hop.file}`);
				report(
					'cycle',
					rule,
					rule.source,
					`alias \`${rule.from}\` redirects in a cycle: ${loop.join(' → ')}` +
						(elsewhere.length > 0 ? ` (via ${elsewhere.join(', ')})` : '')
				);
				unusable = true;
				break;
			}
			// A hop through a rule that is itself broken cannot be resolved; that
			// rule already reported why, so this one just drops out quietly.
			if (broken.has(next.from)) {
				unusable = true;
				break;
			}
			seen.add(next.from);
			via.push(next.from);
			current = next;
		}

		if (unusable) continue;
		redirects.push({
			from: rule.from,
			to: current.to,
			status: rule.status,
			file: rule.file,
			source: rule.source,
			via
		});
	}

	redirects.sort(byPath);
	return { redirects, issues };
}

/**
 * Compile every source into the site's redirect map, or throw.
 *
 * This is the build-time entry point: an inconsistent redirect stops the build
 * instead of reaching production as a dead URL.
 */
export function compileRedirects(input: CompileRedirectsInput): RedirectRule[] {
	const { redirects, issues } = analyzeRedirects(input);
	if (issues.length > 0) throw new RedirectCompileError(issues);
	return redirects;
}
