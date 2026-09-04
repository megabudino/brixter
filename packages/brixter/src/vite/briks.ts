/**
 * The site's brik registry.
 *
 * Loads every `.brix` under the configured directory, derives its schema, and
 * caches the result. Pages are validated against what this returns, so the
 * cache has to drop a brik the moment its file changes — otherwise a dev server
 * would keep reporting errors against markup the author has already fixed.
 *
 * A brik may also be a hand-written `.svelte` component. Those have no template
 * to infer from, so they are registered without a schema and their props are
 * not validated: an escape hatch, and it should look like one.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { buildBrikSchema, type BrikDefinition } from '@brixter/core';

export type BrikKind = 'brix' | 'svelte';

export interface RegisteredBrik {
	name: string;
	kind: BrikKind;
	/** Absolute path on disk. */
	file: string;
	/** Inferred schema and parsed template. `null` for a `.svelte` brik. */
	definition: BrikDefinition | null;
}

export interface BrikRegistry {
	/** Look a brik up by the `type` a page wrote. */
	get(name: string): RegisteredBrik | null;
	/** Every brik name known, for "did you mean" and type generation. */
	names(): string[];
	all(): RegisteredBrik[];
	/** Forget a cached brik (or all of them) after a file changed. */
	invalidate(file?: string): void;
}

/**
 * @param dir Absolute path to the brik directory, or `undefined` when the
 *   consumer has none — every lookup then misses, and pages referencing a brik
 *   are reported as such.
 * @param root Project root, used to keep diagnostics project-relative.
 */
export function createBrikRegistry(dir: string | undefined, root: string): BrikRegistry {
	const cache = new Map<string, RegisteredBrik | null>();

	const load = (name: string): RegisteredBrik | null => {
		if (!dir) return null;

		const brixFile = path.join(dir, `${name}.brix`);
		if (existsSync(brixFile)) {
			const source = readFileSync(brixFile, 'utf-8');
			return {
				name,
				kind: 'brix',
				file: brixFile,
				definition: buildBrikSchema(source, {
					file: toPosix(path.relative(root, brixFile)),
					name
				})
			};
		}

		const svelteFile = path.join(dir, `${name}.svelte`);
		if (existsSync(svelteFile)) {
			return { name, kind: 'svelte', file: svelteFile, definition: null };
		}

		return null;
	};

	return {
		get(name) {
			if (!cache.has(name)) cache.set(name, load(name));
			return cache.get(name) ?? null;
		},

		names() {
			if (!dir || !existsSync(dir)) return [];
			return readdirSync(dir)
				.filter((entry) => entry.endsWith('.brix') || entry.endsWith('.svelte'))
				.map((entry) => entry.replace(/\.(brix|svelte)$/, ''))
				.sort();
		},

		all() {
			return this.names()
				.map((name) => this.get(name))
				.filter((brik): brik is RegisteredBrik => brik !== null);
		},

		invalidate(file) {
			if (!file) {
				cache.clear();
				return;
			}
			const name = path.basename(file).replace(/\.(brix|svelte)$/, '');
			cache.delete(name);
		}
	};
}

function toPosix(value: string): string {
	return value.split(path.sep).join('/');
}
