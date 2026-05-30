/**
 * Vite plugin for brixter.
 *
 * Route mounting is handled by the consumer's SvelteKit `reroute` hook and a
 * hidden catch-all route. The plugin only carries Vite-level integration
 * details that cannot live in SvelteKit route modules.
 */
import type { Plugin } from 'vite';

export interface BrixterPluginOptions {
	/**
	 * Mount path for the CMS inside the consumer's app.
	 *
	 * @default '/admin'
	 */
	adminPath?: string;
}

export function brixter(options: BrixterPluginOptions = {}): Plugin {
	const adminPath = options.adminPath ?? '/admin';
	if (adminPath !== '/admin') {
		// eslint-disable-next-line no-console
		console.warn(
			`brixter: adminPath="${adminPath}" is not officially supported in v0.1; ` +
				`dashboard links still hardcode "/admin". Pin to "/admin" until v0.2.`
		);
	}

	return {
		name: 'brixter',
		config() {
			return {
				ssr: {
					noExternal: ['brixter', 'lucide-svelte']
				}
			};
		}
	};
}
