import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { compileBrixYaml } from './brix-yaml.ts';

const source = `
title: Home
description: Welcome
canonical: https://example.com
components:
  - type: Hero
    props:
      headline: Hi
`;

describe('compileBrixYaml', () => {
	it('injects the BrixSeo component into the head by default', () => {
		const output = compileBrixYaml(source, {});

		expect(output).toContain("import BrixSeo from 'brixter/seo';");
		expect(output).toContain('<svelte:head><BrixSeo {...metadata} /></svelte:head>');
		expect(output).toContain('export const metadata = ');
		expect(output).toContain('"canonical": "https://example.com"');
	});

	it('omits BrixSeo when seo is disabled', () => {
		const output = compileBrixYaml(source, { seo: false });

		expect(output).not.toContain('BrixSeo');
		expect(output).not.toContain('<svelte:head>');
	});

	it('renders plain .brix markup components through the runtime interpreter', () => {
		const dir = mkdtempSync(path.join(tmpdir(), 'brix-'));
		writeFileSync(path.join(dir, 'Showcase.brix'), '<section data-brixter-field="x">x</section>');

		const output = compileBrixYaml(
			`title: Home\ncomponents:\n  - type: Showcase\n    props:\n      x: Hi`,
			{ seo: false },
			dir
		);

		expect(output).toContain("import { renderBrixSource } from '@brixter/core';");
		expect(output).toContain("import Brix0Src from '$lib/brixter/brix/Showcase.brix?raw';");
		expect(output).toContain('{@html renderBrixSource(Brix0Src, component0Props)}');
		// No Svelte component import/instantiation for markup brix.
		expect(output).not.toContain('<Brix0 ');
	});

	it('wraps content in the layout while still injecting SEO', () => {
		const output = compileBrixYaml(`title: Home\nlayout: marketing\ncomponents: []`, {});

		expect(output).toContain("import BrixLayout from '$lib/brixter/layouts/Marketing.svelte';");
		expect(output).toContain('<BrixLayout {metadata} {...metadata}>');
		expect(output).toContain('<svelte:head><BrixSeo {...metadata} /></svelte:head>');
	});
});
