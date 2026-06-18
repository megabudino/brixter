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

	it('wraps content in the layout while still injecting SEO', () => {
		const output = compileBrixYaml(`title: Home\nlayout: marketing\ncomponents: []`, {});

		expect(output).toContain("import BrixLayout from '$lib/brixter/layouts/Marketing.svelte';");
		expect(output).toContain('<BrixLayout {metadata} {...metadata}>');
		expect(output).toContain('<svelte:head><BrixSeo {...metadata} /></svelte:head>');
	});
});
