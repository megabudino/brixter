import { mdsvex } from 'mdsvex';
import adapter from '@sveltejs/adapter-node';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter(),
		// Self-dev aliases mirror brixter's package exports while this package
		// runs directly against source instead of a built dist.
		alias: {
			'brixter/server': 'src/lib/server/index.ts',
			'brixter/editor': 'src/lib/editor/index.ts',
			'brixter/ui': 'src/lib/ui/index.ts',
			'brixter/sveltekit': 'src/lib/sveltekit/index.ts',
			'brixter/sveltekit/server': 'src/lib/sveltekit/server.ts',
			'brixter/sveltekit/api': 'src/lib/sveltekit/api.ts'
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
