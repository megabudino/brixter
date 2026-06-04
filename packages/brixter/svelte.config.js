import { mdsvex } from 'mdsvex';
import adapter from '@sveltejs/adapter-node';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter(),
		// Monorepo dev: resolve published import names against local source.
		// Consumers use `brixter` (npm) and `@brixter/brix-builder` (npm, via brixter dep).
		alias: {
			'@brixter/brix-builder': '../brix-builder/index.ts',
			'brixter/vite': 'src/lib/vite/index.ts',
			'brixter/server': 'src/lib/server/index.ts',
			'brixter/editor': 'src/lib/editor/index.ts',
			'brixter/ui': 'src/lib/ui/index.ts',
			'brixter/sveltekit/server': 'src/lib/sveltekit/server.ts',
			'brixter/sveltekit/api': 'src/lib/sveltekit/api.ts',
			'brixter/styles.css': 'styles.css'
		}
	},
	vitePlugin: {
		dynamicCompileOptions: ({ filename }) =>
			filename.includes('node_modules') ? undefined : { runes: true }
	},
	preprocess: [mdsvex()],
	extensions: ['.svelte', '.svx', '.brix.yaml', '.brix.yml']
};

export default config;
