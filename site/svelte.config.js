import adapter from '@sveltejs/adapter-auto';
import { relative, sep } from 'node:path';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

// Dev (`BRIXTER_SOURCE=1`, run under the tsx loader) imports the preprocessor
// straight from source so edits to `preprocess.ts` apply without rebuilding the
// package. Build/check/prepare use the compiled `dist` (no TS loader needed).
const { brixter } = await import(
	process.env.BRIXTER_SOURCE
		? '../packages/brix-builder/svelte/preprocess.ts'
		: '../packages/brix-builder/dist/svelte/preprocess.js'
);

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		// defaults to rune mode for the project, execept for `node_modules`. Can be removed in svelte 6.
		runes: ({ filename }) => {
			const relativePath = relative(import.meta.dirname, filename);
			const pathSegments = relativePath.toLowerCase().split(sep);
			const isExternalLibrary = pathSegments.includes('node_modules');

			return isExternalLibrary ? undefined : true;
		}
	},
	extensions: ['.svelte', '.brix.svelte', '.brix.yaml', '.brix.yml'],
	preprocess: [brixter(), vitePreprocess()],
	kit: {
		// adapter-auto only supports some environments, see https://svelte.dev/docs/kit/adapter-auto for a list.
		// If your environment is not supported, or you settled on a specific environment, switch out the adapter.
		// See https://svelte.dev/docs/kit/adapters for more information about adapters.
		adapter: adapter(),
		// Monorepo dev: same import paths as a published app (`brixter`, `@brixter/brix-builder`).
		alias: {
			'@brixter/brix-builder': '../packages/brix-builder/index.ts',
			'@brixter/brix-builder/preprocess': '../packages/brix-builder/svelte/preprocess.ts',
			'brixter/server': '../packages/brixter/src/server/index.ts',
			'brixter/editor': '../packages/brixter/src/editor/index.ts',
			'brixter/ui': '../packages/brixter/src/ui/index.ts',
			'brixter/sveltekit/server': '../packages/brixter/src/sveltekit/server.ts',
			'brixter/sveltekit/api': '../packages/brixter/src/sveltekit/api.ts',
			'brixter/styles.css': '../packages/brixter/styles.css'
		}
	}
};

export default config;
