import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { brixter } from 'brixter/vite';

export default defineConfig({
	// `appRoot: 'site'` points Studio's local-mode content store at the sibling
	// `site/` workspace (routesRoot → site/src/routes, mediaDir → site/static),
	// so it edits the same `.brix.yaml`/media the embedded dashboard used to.
	plugins: [tailwindcss(), brixter({ adminPath: '/admin', appRoot: 'site' }), sveltekit()],
	ssr: {
		// lucide-svelte ships extensionless relative imports in its dist
		// (`export * from './icons/index'`) which Node's strict ESM resolver
		// rejects. Forcing Vite to bundle it for SSR routes through Vite's
		// extension-aware resolver, sidestepping the package bug. `brixter` is
		// bundled so its Svelte sources compile.
		noExternal: ['brixter', 'lucide-svelte']
	}
});
