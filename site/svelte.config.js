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
	extensions: ['.svelte', '.md'],
	preprocess: [vitePreprocess()],
	kit: {
		// adapter-auto only supports some environments, see https://svelte.dev/docs/kit/adapter-auto for a list.
		// If your environment is not supported, or you settled on a specific environment, switch out the adapter.
		// See https://svelte.dev/docs/kit/adapters for more information about adapters.
		adapter: adapter(),
		// Monorepo dev: resolve the render runtime from source. `brixter` itself
		// (the vite plugin + `brixter/seo`) resolves through its package exports.
		alias: {
			// More-specific subpath MUST come before '@brixter/core' (Vite alias =
			// first match wins). Otherwise SvelteKit's prefix expansion resolves
			// '@brixter/core/sitemap' to '../packages/core/index.ts/sitemap'.
			'@brixter/core/template': '../packages/core/template/index.ts',
			'@brixter/core/schema': '../packages/core/schema/index.ts',
			'@brixter/core/page': '../packages/core/page/index.ts',
			'@brixter/core/sitemap': '../packages/core/sitemap/index.ts',
			'@brixter/core/redirects': '../packages/core/redirects/index.ts',
			'@brixter/core': '../packages/core/index.ts'
		}
	}
};

export default config;
