import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import { sveltekit } from '@sveltejs/kit/vite';
import { brixter } from './src/lib/vite/index.ts';

export default defineConfig({
	// brixter aliases (brixter/server, brixter/editor, brixter/ui) live in
	// kit.alias inside svelte.config.js so they reach both Vite and TS.
	plugins: [tailwindcss(), brixter({ adminPath: '/admin' }), sveltekit()],
	ssr: {
		// lucide-svelte ships extensionless relative imports in its dist
		// (`export * from './icons/index'`) which Node's strict ESM resolver
		// rejects. Forcing Vite to bundle it for SSR routes through Vite's
		// extension-aware resolver, sidestepping the package bug.
		noExternal: ['lucide-svelte']
	},
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'client',
					browser: {
						enabled: true,
						provider: playwright(),
						instances: [{ browser: 'chromium', headless: true }]
					},
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**']
				}
			},

			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
