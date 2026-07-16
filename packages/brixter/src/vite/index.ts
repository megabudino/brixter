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
	 * Directory containing the progressive-enhancement controllers collected by
	 * `initBrixControllers` (from `brixter/controllers`). Every `*.{ts,js}` file
	 * here that exports an init function is auto-registered.
	 *
	 * @default '$lib/brixter/controllers'
	 */
	controllersDir?: string;
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

const CONTROLLERS_MODULE_ID = 'virtual:brixter-controllers';
const RESOLVED_CONTROLLERS_MODULE_ID = '\0' + CONTROLLERS_MODULE_ID;

/**
 * Turn a controllers directory into a root-relative `import.meta.glob` pattern.
 *
 * The glob lives in a virtual module with no real directory, so a root-relative
 * pattern (leading `/`, resolved against the Vite project root) is required.
 * `$lib/…` maps to `/src/lib/…` — the same seam SvelteKit uses for `$lib`.
 */
function controllersGlobPattern(dir: string): string {
	let base: string;
	if (dir.startsWith('$lib/')) base = '/src/lib/' + dir.slice('$lib/'.length);
	else if (dir.startsWith('/')) base = dir;
	else base = '/' + dir;
	return `${base.replace(/\/$/, '')}/*.{ts,js}`;
}

export function brixter(options: BrixterPluginOptions = {}): Plugin {
	let brixFsDir: string | undefined;
	const controllersPattern = controllersGlobPattern(
		options.controllersDir ?? '$lib/brixter/controllers'
	);

	return {
		name: 'brixter',
		enforce: 'pre',
		resolveId(id) {
			if (id === CONTROLLERS_MODULE_ID) return RESOLVED_CONTROLLERS_MODULE_ID;
			return null;
		},
		load(id) {
			if (id !== RESOLVED_CONTROLLERS_MODULE_ID) return null;
			// Eagerly collect the consumer's controller modules. Adding or removing
			// a file under the controllers directory updates this automatically —
			// no registry to maintain. `initBrixControllers` runs the exports.
			return (
				`const modules = import.meta.glob(${JSON.stringify(controllersPattern)}, { eager: true });\n` +
				`export default modules;\n`
			);
		},
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
