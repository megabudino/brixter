import adapter from '@sveltejs/adapter-auto';
import { relative, sep } from 'node:path';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

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
	extensions: ['.svelte', '.brix.yaml', '.brix.yml'],
	preprocess: [vitePreprocess()],
	kit: {
		// adapter-auto only supports some environments, see https://svelte.dev/docs/kit/adapter-auto for a list.
		// If your environment is not supported, or you settled on a specific environment, switch out the adapter.
		// See https://svelte.dev/docs/kit/adapters for more information about adapters.
		adapter: adapter(),
		// Monorepo dev: same import paths as a published app (`brixter`, `@brixter/brix-builder`).
		alias: {
			'@brixter/core': '../packages/core/index.ts',
			'@brixter/brix-builder/render': '../packages/core/index.ts',
			'@brixter/brix-builder': '../packages/brix-builder/index.ts',
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
