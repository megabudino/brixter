import { mkdtempSync, mkdirSync, writeFileSync, rmSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createBrikRegistry } from './briks.ts';

const roots: string[] = [];

function project(briks: Record<string, string> = {}) {
	const root = mkdtempSync(path.join(tmpdir(), 'brixter-briks-'));
	roots.push(root);
	const dir = path.join(root, 'brix');
	mkdirSync(dir, { recursive: true });
	for (const [name, source] of Object.entries(briks)) writeFileSync(path.join(dir, name), source);
	return { root, dir, registry: createBrikRegistry(dir, root) };
}

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('createBrikRegistry', () => {
	it('loads a `.brix` file and infers its schema', () => {
		const { registry } = project({ 'Hero.brix': '---\ntitle: Hero\n---\n<h1>{headline}</h1>' });
		const hero = registry.get('Hero');

		expect(hero).toMatchObject({ name: 'Hero', kind: 'brix' });
		expect(hero?.definition?.schema.props.headline).toMatchObject({ type: 'string' });
	});

	it('reports a brik that does not exist as a miss', () => {
		expect(project().registry.get('Nope')).toBeNull();
	});

	it('registers a hand-written `.svelte` brik with no schema', () => {
		const { registry } = project({ 'Custom.svelte': '<h1>hi</h1>' });

		expect(registry.get('Custom')).toMatchObject({ kind: 'svelte', definition: null });
	});

	it('prefers `.brix` when both exist', () => {
		const { registry } = project({ 'Hero.brix': '<h1>{a}</h1>', 'Hero.svelte': '<h1>b</h1>' });

		expect(registry.get('Hero')?.kind).toBe('brix');
	});

	it('lists every brik by name, sorted', () => {
		const { registry } = project({ 'Zeta.brix': '<p>{a}</p>', 'Alpha.svelte': '' });

		expect(registry.names()).toEqual(['Alpha', 'Zeta']);
	});

	it('names project-relative paths in a brik’s own diagnostics', () => {
		const { registry } = project({ 'Bad.brix': '<p>{@sparkle x}</p>' });

		expect(registry.get('Bad')?.definition?.issues[0].file).toBe('brix/Bad.brix');
	});

	it('serves a cached schema until the file is invalidated', () => {
		const { dir, registry } = project({ 'Hero.brix': '<h1>{headline}</h1>' });

		expect(registry.get('Hero')?.definition?.schema.props).toHaveProperty('headline');
		writeFileSync(path.join(dir, 'Hero.brix'), '<h1>{title}</h1>');
		expect(registry.get('Hero')?.definition?.schema.props).toHaveProperty('headline');

		registry.invalidate(path.join(dir, 'Hero.brix'));
		expect(registry.get('Hero')?.definition?.schema.props).toHaveProperty('title');
	});

	it('re-reads everything when invalidated wholesale', () => {
		const { dir, registry } = project({ 'Hero.brix': '<h1>{headline}</h1>' });

		registry.get('Hero');
		unlinkSync(path.join(dir, 'Hero.brix'));
		registry.invalidate();

		expect(registry.get('Hero')).toBeNull();
	});

	it('misses everything when the project has no brik directory', () => {
		const registry = createBrikRegistry(undefined, '/tmp');

		expect(registry.get('Hero')).toBeNull();
		expect(registry.names()).toEqual([]);
	});
});
