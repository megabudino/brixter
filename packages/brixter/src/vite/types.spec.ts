import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createBrikRegistry } from './briks.ts';
import { generateTypes, writeGeneratedTypes } from './types.ts';

const roots: string[] = [];

function project(briks: Record<string, string>) {
	const root = mkdtempSync(path.join(tmpdir(), 'brixter-types-'));
	roots.push(root);
	const dir = path.join(root, 'brix');
	mkdirSync(dir, { recursive: true });
	for (const [name, source] of Object.entries(briks)) {
		writeFileSync(path.join(dir, name), source);
	}
	return { root, dir, registry: createBrikRegistry(dir, root) };
}

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const types = (briks: Record<string, string>) => generateTypes(project(briks).registry);

describe('generateTypes', () => {
	it('declares an interface per brik', () => {
		const output = types({ 'Hero.brix': '---\ndescription: The hero.\n---\n<h1>{headline}</h1>' });

		expect(output).toContain('/** The hero. */');
		expect(output).toContain('export interface HeroProps {');
		expect(output).toContain('headline?: string;');
	});

	it('marks a `@required` prop as non-optional', () => {
		expect(types({ 'Hero.brix': '<h1>{@required headline}</h1>' })).toContain('headline: string;');
	});

	it.each([
		['<p>{@number count}</p>', 'count?: number;'],
		['<p>{@boolean flag}</p>', 'flag?: boolean;'],
		['<p>{@json data}</p>', 'data?: unknown;'],
		["<p>{@enum('a','b') pick}</p>", 'pick?: "a" | "b";'],
		['<a href={cta}>x</a>', 'cta?: string;']
	])('renders %s as %s', (template, expected) => {
		expect(types({ 'X.brix': template })).toContain(expected);
	});

	it('renders collections and nested objects', () => {
		const output = types({
			'X.brix': '{#each plans as plan}<b>{plan.name}</b>{/each}<a href={cta.href}>{cta.label}</a>'
		});

		expect(output).toContain('plans?: Array<{');
		expect(output).toContain('cta?: {');
		expect(output).toContain('href?: string;');
	});

	it('documents defaults and constraints, truncating a long one', () => {
		const output = types({
			'X.brix': `<p>{@number @min(1) @max(9) count ?? 3}</p><span>{@icon glyph ?? '${'<svg/>'.padEnd(120, 'x')}'}</span>`
		});

		expect(output).toContain('default: 3 — min: 1 — max: 9');
		expect(output).toContain('…"');
		expect(output.split('\n').every((line) => line.length < 200)).toBe(true);
	});

	it('maps every brik by the `type` a page writes', () => {
		const output = types({ 'Hero.brix': '<h1>{a}</h1>', 'Footer.brix': '<p>{b}</p>' });

		expect(output).toContain('Footer: FooterProps;');
		expect(output).toContain('Hero: HeroProps;');
		expect(output).toContain('export type BrikEntry');
		expect(output).toContain('export interface PageFrontmatter');
	});

	it('leaves a hand-written Svelte brik open', () => {
		const output = types({ 'Custom.svelte': '<h1>hi</h1>' });

		expect(output).toContain('export type CustomProps = Record<string, unknown>;');
	});
});

describe('writeGeneratedTypes', () => {
	it('creates the file and its directory', () => {
		const { root, registry } = project({ 'Hero.brix': '<h1>{headline}</h1>' });
		const target = path.join(root, 'nested', 'brixter.generated.d.ts');

		writeGeneratedTypes(registry, target);

		expect(existsSync(target)).toBe(true);
		expect(readFileSync(target, 'utf-8')).toContain('HeroProps');
	});

	it('rewrites only when the content changed', () => {
		const { root, registry } = project({ 'Hero.brix': '<h1>{headline}</h1>' });
		const target = path.join(root, 'brixter.generated.d.ts');

		writeGeneratedTypes(registry, target);
		writeFileSync(target, readFileSync(target, 'utf-8') + '\n// touched\n');
		writeGeneratedTypes(registry, target);

		// Same schema, different file: the write goes through and drops the edit.
		expect(readFileSync(target, 'utf-8')).not.toContain('touched');
	});
});
