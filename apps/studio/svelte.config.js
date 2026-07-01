import adapter from '@sveltejs/adapter-auto';
import { relative, sep } from 'node:path';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		// defaults to rune mode for the project, except for `node_modules`. Can be removed in svelte 6.
		runes: ({ filename }) => {
			const relativePath = relative(import.meta.dirname, filename);
			const pathSegments = relativePath.toLowerCase().split(sep);
			const isExternalLibrary = pathSegments.includes('node_modules');

			return isExternalLibrary ? undefined : true;
		}
	},
	extensions: ['.svelte', '.brix.yaml', '.brix.yml'],
	preprocess: [vitePreprocess()],
	kit: {
		adapter: adapter(),
		// Monorepo dev: resolve the sibling packages from source, same seam the site uses.
		alias: {
			'@brixter/core': '../../packages/core/index.ts',
			'@brixter/brix-builder/render': '../../packages/core/index.ts',
			'@brixter/brix-builder': '../../packages/brix-builder/index.ts',
			'brixter/styles.css': '../../packages/brixter/styles.css'
		}
	}
};

export default config;
