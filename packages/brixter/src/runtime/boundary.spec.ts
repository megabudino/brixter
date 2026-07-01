/**
 * Boundary guardrail: the OSS render runtime (`src/runtime/**`) must never depend
 * on Studio code (`src/studio/**`, the `brixter/server|editor|ui|sveltekit`
 * subpaths, or a bare `./server` / `./dashboard`). Studio may depend on runtime
 * and on `@brixter/core`, but not the reverse — this keeps the runtime carve-out
 * a mechanical `git mv` away from becoming its own package.
 *
 * This scans source instead of resolving a module graph so it stays valid even
 * for `.svelte` files and `export … from` re-exports.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const runtimeDir = dirname(fileURLToPath(import.meta.url));
const srcDir = resolve(runtimeDir, '..');
const studioDir = join(srcDir, 'studio');

const CODE_FILE = /\.(ts|js|mjs|cjs|svelte)$/;

/** Static/dynamic import + re-export specifiers. */
const SPECIFIER_RE =
	/(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

/** Studio-owned package subpaths that runtime must not reach for. */
const STUDIO_SPECIFIERS = [
	/^brixter\/server(\/|$)/,
	/^brixter\/editor(\/|$)/,
	/^brixter\/ui(\/|$)/,
	/^brixter\/sveltekit(\/|$)/
];

function walk(dir: string): string[] {
	const out: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) out.push(...walk(full));
		else if (CODE_FILE.test(entry.name)) out.push(full);
	}
	return out;
}

function studioViolations(file: string): string[] {
	const content = readFileSync(file, 'utf-8');
	const violations: string[] = [];
	for (const match of content.matchAll(SPECIFIER_RE)) {
		const spec = match[1] ?? match[2] ?? match[3];
		if (!spec) continue;
		if (spec.startsWith('.')) {
			const resolved = resolve(dirname(file), spec);
			if (resolved === studioDir || resolved.startsWith(studioDir + sep)) {
				violations.push(spec);
			}
		} else if (STUDIO_SPECIFIERS.some((re) => re.test(spec))) {
			violations.push(spec);
		}
	}
	return violations;
}

describe('runtime → studio boundary', () => {
	const files = walk(runtimeDir).filter((f) => f !== fileURLToPath(import.meta.url));

	it('finds runtime source files to check', () => {
		expect(files.length).toBeGreaterThan(0);
	});

	for (const file of files) {
		it(`${relative(srcDir, file)} does not import from studio`, () => {
			expect(studioViolations(file)).toEqual([]);
		});
	}
});
