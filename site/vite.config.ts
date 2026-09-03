import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { brixter } from 'brixter/vite';

export default defineConfig({
	plugins: [tailwindcss(), brixter(), sveltekit()],
	ssr: {
		// Bundle `brixter` so its Svelte source (e.g. `brixter/seo`, injected into
		// compiled `+page.md` pages) compiles through Vite for SSR routes.
		noExternal: ['brixter']
	}
});
