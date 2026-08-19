/**
 * `brixter check` and `brixter types` without a bundler.
 *
 * The Vite plugin already validates every page it compiles, but a build is a
 * slow way to ask "is this site coherent?" — and CI often wants the answer
 * before it has a build at all. This runs the same schema inference and the
 * same validator directly over the filesystem, so the two can never disagree.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { compileBrixPage } from '../vite/page.ts';
import { createBrikRegistry } from '../vite/briks.ts';
import { writeGeneratedTypes } from '../vite/types.ts';
import type { SchemaIssue } from '@brixter/core';

export interface CheckOptions {
	/** Project root. Defaults to the current working directory. */
	root?: string;
	routesDir?: string;
	brixDir?: string;
}

export interface CheckResult {
	issues: SchemaIssue[];
	/** How many pages and briks were looked at, for the summary line. */
	pages: number;
	briks: number;
}

const PAGE_FILE = /^\+page(@[^.]*)?\.md$/;

/** Validate every page and brik in a project. */
export function checkProject(options: CheckOptions = {}): CheckResult {
	const root = path.resolve(options.root ?? process.cwd());
	const routesDir = path.resolve(root, options.routesDir ?? 'src/routes');
	const brixDir = resolveBrixDir(root, options.brixDir);
	const registry = createBrikRegistry(brixDir, root);

	const issues: SchemaIssue[] = [];
	const seen = new Set<string>();
	let pages = 0;

	// Briks are checked on their own too: one that no page uses can still be
	// broken, and finding that out at authoring time beats finding out later.
	const briks = registry.all();
	for (const brik of briks) {
		for (const problem of brik.definition?.issues ?? []) push(issues, seen, problem);
	}

	for (const [absolute, relative] of walk(routesDir)) {
		if (!PAGE_FILE.test(path.basename(relative))) continue;
		pages += 1;
		const file = toPosix(path.relative(root, absolute));
		const result = compileBrixPage(readFileSync(absolute, 'utf-8'), file, { brixDir }, registry);
		for (const problem of result.issues) push(issues, seen, problem);
	}

	return { issues, pages, briks: briks.length };
}

/** Write the generated declarations for a project. Returns the file written. */
export function generateProjectTypes(options: CheckOptions & { out?: string } = {}): string {
	const root = path.resolve(options.root ?? process.cwd());
	const registry = createBrikRegistry(resolveBrixDir(root, options.brixDir), root);
	const target = path.resolve(root, options.out ?? 'src/lib/brixter/brixter.generated.d.ts');
	writeGeneratedTypes(registry, target);
	return toPosix(path.relative(root, target));
}

/**
 * A brik's own issues are reported once even when several pages use it, and a
 * page reports each of its own problems once.
 */
function push(issues: SchemaIssue[], seen: Set<string>, problem: SchemaIssue): void {
	if (seen.has(problem.message)) return;
	seen.add(problem.message);
	issues.push(problem);
}

function resolveBrixDir(root: string, option: string | undefined): string | undefined {
	const dir = option ?? '$lib/brixter/brix';
	const resolved = dir.startsWith('$lib/')
		? path.join(root, 'src', 'lib', dir.slice('$lib/'.length))
		: path.resolve(root, dir);
	return existsSync(resolved) ? resolved : undefined;
}

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

function toPosix(value: string): string {
	return value.split(path.sep).join('/');
}
