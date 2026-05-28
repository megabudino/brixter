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
	kit: {
		// adapter-auto only supports some environments, see https://svelte.dev/docs/kit/adapter-auto for a list.
		// If your environment is not supported, or you settled on a specific environment, switch out the adapter.
		// See https://svelte.dev/docs/kit/adapters for more information about adapters.
		adapter: adapter(),
		// Subpath aliases used by the brixter dashboard sources. The package
		// itself doesn't ship `exports` yet, so we resolve them into the
		// workspace source — same approach the package uses for its own dev.
		alias: {
			'brixter/server': '../packages/brixter-dashboard/src/lib/server/index.ts',
			'brixter/editor': '../packages/brixter-dashboard/src/lib/editor/index.ts',
			'brixter/ui': '../packages/brixter-dashboard/src/lib/ui/index.ts'
		},
		// The admin routes under src/routes/admin are written at Vite startup
		// by the brixter plugin and reference SvelteKit's generated ./$types,
		// which only exist after the sync runs. Exclude them from standalone
		// typechecking so `svelte-check` doesn't complain on a cold start.
		typescript: {
			config: (cfg) => {
				cfg.exclude = [...(cfg.exclude ?? []), '../src/routes/admin/**'];
				return cfg;
			}
		}
	}
};

export default config;
