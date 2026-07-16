import { describe, expect, it } from 'vitest';
import type { Plugin } from 'vite';
import { brixter } from './index.ts';

// The controllers virtual module + glob pattern are exercised here without a
// full Vite run: call the plugin's `resolveId`/`load` hooks directly.
type HookFn = (id: string) => unknown;
const resolveId = (plugin: Plugin) => (plugin.resolveId as HookFn) ?? (() => null);
const load = (plugin: Plugin) => (plugin.load as HookFn) ?? (() => null);

describe('brixter() controllers virtual module', () => {
	it('resolves the virtual id and loads an eager glob of the default directory', () => {
		const plugin = brixter();

		expect(resolveId(plugin)('virtual:brixter-controllers')).toBe('\0virtual:brixter-controllers');
		expect(resolveId(plugin)('something-else')).toBe(null);

		const code = load(plugin)('\0virtual:brixter-controllers') as string;
		expect(code).toContain(
			'import.meta.glob("/src/lib/brixter/controllers/*.{ts,js}", { eager: true })'
		);
		expect(code).toContain('export default modules;');
	});

	it('honours a custom controllersDir', () => {
		const plugin = brixter({ controllersDir: '$lib/enhancers' });
		const code = load(plugin)('\0virtual:brixter-controllers') as string;
		expect(code).toContain('import.meta.glob("/src/lib/enhancers/*.{ts,js}"');
	});

	it('does not load unrelated ids', () => {
		const plugin = brixter();
		expect(load(plugin)('\0some-other-module')).toBe(null);
	});
});
