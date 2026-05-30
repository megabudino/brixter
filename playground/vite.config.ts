import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { brixter } from 'brixter/vite';

export default defineConfig({
	plugins: [tailwindcss(), brixter({ adminPath: '/admin' }), sveltekit()],
	ssr: {
		// lucide-svelte ships extensionless relative imports in its dist
		// (`export * from './icons/index'`) which Node's strict ESM resolver
		// rejects. Forcing Vite to bundle it for SSR routes through Vite's
		// extension-aware resolver, sidestepping the package bug.
		noExternal: ['brixter', 'lucide-svelte']
	}
});
