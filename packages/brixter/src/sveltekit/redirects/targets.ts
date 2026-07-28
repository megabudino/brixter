/**
 * Where each hosting platform expects its redirects, and how to put them there.
 *
 * The compiled map is written into the artefact the platform already reads, so
 * the edge answers with a real status code before any application code runs.
 * A platform whose deployment output has no redirect format is not quietly
 * downgraded to a meta refresh — it is a build error.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
	formatRedirectsFile,
	mergeRedirectsFile,
	toVercelRoutes,
	type RedirectRule
} from '@brixter/core/redirects';

/** The deployment formats brixter can emit into. */
export type RedirectTarget = 'netlify' | 'vercel' | 'cloudflare';

export const REDIRECT_TARGETS: readonly RedirectTarget[] = ['netlify', 'vercel', 'cloudflare'];

/** Map an adapter package name onto its deployment format. */
export function targetFromAdapter(adapterName: string): RedirectTarget | null {
	if (adapterName.includes('netlify')) return 'netlify';
	if (adapterName.includes('vercel')) return 'vercel';
	if (adapterName.includes('cloudflare')) return 'cloudflare';
	return null;
}

/**
 * Detect the platform from the build environment.
 *
 * `adapter-auto` resolves its real adapter at build time from exactly these
 * variables, so reading them gives the same answer it reached.
 */
export function targetFromEnv(env: Record<string, string | undefined>): RedirectTarget | null {
	if (env.NETLIFY) return 'netlify';
	if (env.VERCEL) return 'vercel';
	if (env.CF_PAGES) return 'cloudflare';
	return null;
}

/** Where a target's build output lands, when the project hasn't said otherwise. */
const DEFAULT_OUT_DIRS: Record<RedirectTarget, string[]> = {
	// adapter-netlify honours `netlify.toml`; `build` is its documented default.
	netlify: ['build'],
	vercel: ['.vercel/output'],
	// adapter-cloudflare's output directory has moved between major versions.
	cloudflare: ['.svelte-kit/cloudflare', '.cloudflare/public', 'build']
};

const NETLIFY_PUBLISH = /^\s*publish\s*=\s*["']([^"']+)["']/m;

function netlifyPublishDir(root: string): string | null {
	const config = path.join(root, 'netlify.toml');
	if (!existsSync(config)) return null;
	const match = NETLIFY_PUBLISH.exec(readFileSync(config, 'utf-8'));
	return match ? match[1] : null;
}

/**
 * Resolve the directory holding the deployment output. Returns `null` when
 * nothing plausible exists — the caller turns that into an actionable error
 * rather than silently dropping the redirects.
 */
export function resolveOutDir(
	target: RedirectTarget,
	root: string,
	outDir?: string
): string | null {
	if (outDir) return path.resolve(root, outDir);

	const candidates = [...DEFAULT_OUT_DIRS[target]];
	if (target === 'netlify') {
		const publish = netlifyPublishDir(root);
		if (publish) candidates.unshift(publish);
	}

	for (const candidate of candidates) {
		const resolved = path.resolve(root, candidate);
		if (existsSync(resolved)) return resolved;
	}
	return null;
}

export interface WriteResult {
	/** The file that was written. */
	file: string;
	count: number;
}

/**
 * Write the compiled map into `outDir` in the target's native format.
 *
 * Rewriting is idempotent: a previously generated block is replaced, never
 * stacked, so repeated builds into the same directory converge.
 */
export function writeRedirects(
	target: RedirectTarget,
	rules: readonly RedirectRule[],
	outDir: string
): WriteResult {
	if (target === 'vercel') return writeVercelConfig(rules, outDir);
	return writeRedirectsFile(rules, outDir);
}

/** Netlify and Cloudflare Pages both read a `_redirects` file, first match wins. */
function writeRedirectsFile(rules: readonly RedirectRule[], outDir: string): WriteResult {
	const file = path.join(outDir, '_redirects');
	const existing = existsSync(file) ? readFileSync(file, 'utf-8') : '';
	if (!existing && rules.length === 0) return { file, count: 0 };

	// Prepended, because the adapters append a catch-all that would otherwise
	// match every alias before our rules are ever considered.
	const merged = mergeRedirectsFile(existing, formatRedirectsFile(rules));
	mkdirSync(outDir, { recursive: true });
	writeFileSync(file, merged);
	return { file, count: rules.length };
}

interface VercelConfig {
	routes?: unknown[];
	[key: string]: unknown;
}

/**
 * Vercel's Build Output API keeps routing in `config.json`. Redirects go at the
 * front, ahead of the filesystem handler, so they resolve before the app.
 */
function writeVercelConfig(rules: readonly RedirectRule[], outDir: string): WriteResult {
	const file = path.join(outDir, 'config.json');
	if (!existsSync(file)) {
		throw new Error(
			`expected the Vercel adapter to have written ${file}. Pass \`outDir\` to withRedirects() ` +
				`if the build output lives elsewhere.`
		);
	}

	const config = JSON.parse(readFileSync(file, 'utf-8')) as VercelConfig;
	const routes = Array.isArray(config.routes) ? config.routes : [];
	const emitted = toVercelRoutes(rules);
	// No marker key: `config.json` is schema-validated by Vercel, so the file
	// stays free of anything it doesn't define. Matching on `src` is enough to
	// keep a repeated write idempotent.
	const claimed = new Set(emitted.map((route) => route.src));
	const kept = routes.filter(
		(route) =>
			!(
				typeof route === 'object' &&
				route !== null &&
				claimed.has((route as { src?: string }).src ?? '')
			)
	);
	config.routes = [...emitted, ...kept];
	writeFileSync(file, JSON.stringify(config, null, 2));
	return { file, count: rules.length };
}
