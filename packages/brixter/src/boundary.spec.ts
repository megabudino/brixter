/**
 * Boundary guardrail: the OSS render runtime (the `brixter` package) must never
 * pull server code into its dependency graph. The visual editor (Brixter Editor)
 * is a separate application, so the surviving invariant is a dependency check:
 * this package must not declare any server dependency (Better Auth, SQLite, or
 * Octokit).
 *
 * A failure here means a server import crept back into the runtime — the exact
 * regression the split exists to prevent.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf-8')) as {
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
	peerDependencies?: Record<string, string>;
	optionalDependencies?: Record<string, string>;
};

/** A dependency name belongs to the server (Studio) side, not the OSS runtime. */
function isServerDependency(name: string): boolean {
	return (
		name === 'better-auth' ||
		name === 'better-sqlite3' ||
		name.startsWith('@better-auth/') ||
		name.startsWith('@octokit/')
	);
}

const BUCKETS = [
	'dependencies',
	'devDependencies',
	'peerDependencies',
	'optionalDependencies'
] as const;

describe('brixter runtime dependency boundary', () => {
	for (const bucket of BUCKETS) {
		it(`${bucket} contain no server packages (better-auth / better-sqlite3 / @octokit)`, () => {
			const offending = Object.keys(pkg[bucket] ?? {}).filter(isServerDependency);
			expect(offending).toEqual([]);
		});
	}
});
