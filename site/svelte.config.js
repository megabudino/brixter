import adapter from '@sveltejs/adapter-auto';
import { relative, sep } from 'node:path';

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
	kit: {
		// adapter-auto only supports some environments, see https://svelte.dev/docs/kit/adapter-auto for a list.
		// If your environment is not supported, or you settled on a specific environment, switch out the adapter.
		// See https://svelte.dev/docs/kit/adapters for more information about adapters.
		adapter: adapter(),
		// Workspace-time aliases mirror brixter's package exports while we run
		// directly against source instead of a built dist.
		alias: {
			'@brixter/brix-builder': '../packages/brix-builder/index.ts',
			'brixter/server': '../packages/brixter/src/lib/server/index.ts',
			'brixter/editor': '../packages/brixter/src/lib/editor/index.ts',
			'brixter/ui': '../packages/brixter/src/lib/ui/index.ts',
			'brixter/sveltekit/server': '../packages/brixter/src/lib/sveltekit/server.ts',
			'brixter/sveltekit/api': '../packages/brixter/src/lib/sveltekit/api.ts',
			'brixter/sveltekit': '../packages/brixter/src/lib/sveltekit/index.ts'
		}
	}
};

export default config;
