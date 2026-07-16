/**
 * Vite plugin for brixter.
 *
 * Compiles `.brix.yaml` / `.brix.yml` page files into Svelte components at
 * transform time. It carries only the Vite-level integration that cannot live
 * in SvelteKit route modules.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';
import { compileBrixYaml, isBrixYaml } from './brix-yaml.ts';

export interface BrixterPluginOptions {
	/**
	 * Directory containing the components referenced by `.brix.yaml` files.
	 *
	 * @default '$lib/brixter/brix'
	 */
	brixDir?: string;
	/**
	 * Directory containing page layout components referenced by `.brix.yaml` files.
	 *
	 * @default '$lib/brixter/layouts'
	 */
	layoutsDir?: string;
	/**
	 * Optional layout name used when a `.brix.yaml` file omits `layout`.
	 */
	defaultLayout?: string;
	/**
	 * Inject a `<BrixSeo>` component into every compiled `.brix.yaml` page so
	 * standard SEO metadata is rendered into `<head>` regardless of layout.
	 *
	 * @default true
	 */
	seo?: boolean;
}

export function brixter(options: BrixterPluginOptions = {}): Plugin {
	let brixFsDir: string | undefined;

	return {
		name: 'brixter',
		enforce: 'pre',
		config(userConfig) {
			const root = path.resolve(userConfig.root ?? process.cwd());

			// Resolve the brix directory to a filesystem path so we can check
			// whether a `.brix` markup file exists for a referenced component.
			const brixDir = options.brixDir ?? '$lib/brixter/brix';
			if (brixDir.startsWith('$lib/')) {
				const libPath = path.join(root, 'src', 'lib', brixDir.slice('$lib/'.length));
				brixFsDir = existsSync(libPath) ? libPath : undefined;
			} else {
				brixFsDir = path.resolve(root, brixDir);
			}

			return {
				ssr: {
					// Keep the package source bundled so its Svelte modules (e.g.
					// `brixter/seo`, injected into compiled pages) compile for SSR.
					noExternal: ['brixter']
				}
			};
		},
		transform(code, id) {
			if (!isBrixYaml(id)) return null;
			return {
				code: compileBrixYaml(code, options, brixFsDir),
				map: { mappings: '' }
			};
		}
	};
}
