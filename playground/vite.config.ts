import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { brixter } from 'brixter/src/lib/vite/index.ts';

export default defineConfig({
	plugins: [tailwindcss(), brixter({ adminPath: '/admin' }), sveltekit()]
});
