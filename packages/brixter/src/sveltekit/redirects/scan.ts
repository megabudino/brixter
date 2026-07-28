/**
 * Filesystem scans over the app's routes directory.
 *
 * Two things come out of the same walk: the *content tree* — every `.brix.yaml`
 * page with the metadata it declares — and, for callers that have no framework
 * route manifest at hand, an approximation of one built from the directory
 * layout. The build should always prefer SvelteKit's real manifest.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import yaml from 'yaml';
import { routeFileToUrl } from '@brixter/core/sitemap';
import { routeIdToPattern, type KnownRoute } from '@brixter/core/redirects';

const { parse: parseYaml } = yaml;

const PAGE_BRIX_FILE = /^\+page(@[^.]*)?\.brix\.ya?ml$/;
const ROUTE_FILE = /^\+(page|server)(@[^.]*)?\.[^.]+(\.[^.]+)*$/;

/** A `.brix.yaml` page as found on disk. */
export interface ScannedPage {
	/** Project-relative, POSIX-separated — this is what diagnostics print. */
	file: string;
	/** SvelteKit route id, e.g. `/(marketing)/pricing`. */
	routeId: string;
	/** The URL the page serves, or `null` when the route is dynamic. */
	url: string | null;
	/** Everything the page declares: the parsed document. */
	metadata: unknown;
}

function toPosix(value: string): string {
	return value.split(path.sep).join('/');
}

/** Walk a directory, yielding `[absolutePath, relativePath]` for every file. */
function* walk(dir: string, base = dir): Generator<[string, string]> {
	if (!existsSync(dir)) return;
	for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
		a.name < b.name ? -1 : 1
	)) {
		const absolute = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
			yield* walk(absolute, base);
		} else if (entry.isFile()) {
			yield [absolute, toPosix(path.relative(base, absolute))];
		}
	}
}

/**
 * Collect every `.brix.yaml` page under `routesDir`.
 *
 * A page whose YAML does not parse is skipped rather than thrown on: the
 * `.brix.yaml` compiler owns that error and reports it with far better context
 * than this scan could.
 */
export function scanBrixPages(routesDir: string, projectRoot: string): ScannedPage[] {
	const pages: ScannedPage[] = [];
	for (const [absolute, relative] of walk(routesDir)) {
		const name = relative.slice(relative.lastIndexOf('/') + 1);
		if (!PAGE_BRIX_FILE.test(name)) continue;

		let metadata: unknown;
		try {
			metadata = parseYaml(readFileSync(absolute, 'utf-8'));
		} catch {
			continue;
		}

		const dir = relative.slice(0, Math.max(0, relative.lastIndexOf('/')));
		pages.push({
			file: toPosix(path.relative(projectRoot, absolute)),
			routeId: '/' + dir,
			url: routeFileToUrl(relative),
			metadata
		});
	}
	return pages;
}

/**
 * Derive a route manifest from the directory layout, for callers with no
 * framework manifest — the dev server, tooling. Every directory holding a
 * `+page.*` or `+server.*` file is a route.
 */
export function scanRoutes(routesDir: string): KnownRoute[] {
	const ids = new Set<string>();
	for (const [, relative] of walk(routesDir)) {
		const slash = relative.lastIndexOf('/');
		const name = relative.slice(slash + 1);
		if (!ROUTE_FILE.test(name)) continue;
		ids.add('/' + relative.slice(0, Math.max(0, slash)));
	}
	return [...ids].map((id) => ({ id, pattern: routeIdToPattern(id) }));
}

/** Root-relative URLs for every file in the static assets directory. */
export function scanStaticAssets(assetsDir: string): string[] {
	return [...walk(assetsDir)].map(([, relative]) => '/' + relative);
}
