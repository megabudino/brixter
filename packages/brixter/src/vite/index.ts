/**
 * Vite plugin for brixter.
 *
 * Compiles `+page.md` files into Svelte components at transform time, and holds
 * pages to the schemas their briks declare: a mistyped prop, a missing required
 * one, or a brik that does not exist stops the build with a file, a line, and
 * the path of the field at fault. In `vite dev` the same issues surface through
 * the error overlay instead, so one bad page does not take the server down.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';
import { SchemaError, type SchemaIssue } from '@brixter/core';
import { createBrikRegistry, type BrikRegistry } from './briks.ts';
import { compileBrixPage, isBrixPage } from './page.ts';
import { writeGeneratedTypes } from './types.ts';
import {
	compileDevRedirects,
	resolveDevRedirect,
	type CompiledDevRedirects,
	type DevRedirectsOptions
} from './redirects.ts';

export interface BrixterPluginOptions {
	/**
	 * Directory containing the briks referenced by `+page.md` files.
	 *
	 * @default '$lib/brixter/brix'
	 */
	brixDir?: string;
	/**
	 * Directory containing page layout components referenced by `+page.md` files.
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
	 * Optional layout name used when a `+page.md` file omits `layout`.
	 */
	defaultLayout?: string;
	/**
	 * Inject a `<BrixSeo>` component into every compiled page so standard SEO
	 * metadata is rendered into `<head>` regardless of layout.
	 *
	 * @default true
	 */
	seo?: boolean;
	/**
	 * Emit the `data-brixter-*` attributes the visual editor binds click-to-edit
	 * to. Turn off for a production build that will never be opened in the
	 * editor; the rendered HTML is a little smaller and carries no authoring
	 * metadata.
	 *
	 * @default true
	 */
	editorAnchors?: boolean;
	/**
	 * Write TypeScript declarations for every brik's props and for the page
	 * frontmatter, so `svelte-check` and the editor catch a bad prop before the
	 * build does. Pass a path to choose where; `false` to skip.
	 *
	 * @default '$lib/brixter/brixter.generated.d.ts'
	 */
	types?: string | false;
	/**
	 * Serve page `aliases` as real redirects in `vite dev`, matching what the
	 * hosting layer will do in production. Pass the same `sources` you give
	 * `withRedirects()` so both see the same rules.
	 *
	 * Compiling and *emitting* redirects for production is the adapter's job —
	 * see `brixter/sveltekit/redirects`.
	 */
	redirects?: DevRedirectsOptions | false;
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

/** Resolve a `$lib/…`-style option to a filesystem path under `root`. */
function resolveDir(dir: string, root: string): string {
	if (dir.startsWith('$lib/')) return path.join(root, 'src', 'lib', dir.slice('$lib/'.length));
	return path.resolve(root, dir);
}

export function brixter(options: BrixterPluginOptions = {}): Plugin {
	const controllersPattern = controllersGlobPattern(
		options.controllersDir ?? '$lib/brixter/controllers'
	);

	let root = process.cwd();
	let brixFsDir: string | undefined;
	let registry: BrikRegistry;

	const refreshTypes = () => {
		if (options.types === false || !registry) return;
		writeGeneratedTypes(registry, resolveTypesPath(options.types, root));
	};

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
			root = path.resolve(userConfig.root ?? process.cwd());

			// Resolve the brik directory to a filesystem path: briks are read from
			// disk to derive their schemas, not just imported.
			const resolved = resolveDir(options.brixDir ?? '$lib/brixter/brix', root);
			brixFsDir = existsSync(resolved) ? resolved : undefined;
			registry = createBrikRegistry(brixFsDir, root);

			return {
				ssr: {
					// Keep the package source bundled so its Svelte modules (e.g.
					// `brixter/seo`, injected into compiled pages) compile for SSR.
					noExternal: ['brixter']
				}
			};
		},

		buildStart() {
			registry?.invalidate();
			refreshTypes();
		},

		transform(code, id) {
			if (!isBrixPage(id)) return null;

			const file = toPosix(path.relative(root, id.split('?', 1)[0]));
			const result = compileBrixPage(code, file, options, registry);

			// `this.error` fails this module: in a build that stops it, and in `vite
			// dev` it raises the error overlay while the server keeps serving every
			// other route. Both are what we want, so there is nothing to branch on.
			if (result.issues.length > 0) this.error(describe(result.issues));

			return { code: result.code, map: { mappings: '' } };
		},

		configureServer(server) {
			// A brik's schema is what pages are validated against, so a change to one
			// has to drop the cached schema *and* re-run every page through it.
			const onBrikChange = (file: string) => {
				if (!brixFsDir || !file.startsWith(brixFsDir)) return;
				registry.invalidate(file);
				refreshTypes();
				for (const module of server.moduleGraph.idToModuleMap.values()) {
					if (isBrixPage(module.id ?? '')) server.moduleGraph.invalidateModule(module);
				}
				server.ws.send({ type: 'full-reload' });
			};
			server.watcher.on('change', onBrikChange);
			server.watcher.on('add', onBrikChange);
			server.watcher.on('unlink', onBrikChange);

			const redirectOptions = options.redirects === false ? null : (options.redirects ?? {});
			if (!redirectOptions || redirectOptions.enabled === false) return;

			// Compiled lazily and thrown away whenever a route file changes, so
			// adding an alias takes effect without restarting the dev server.
			let compiled: CompiledDevRedirects | null = null;
			const invalidate = (file: string) => {
				if (/[\\/]\+(page|server)\b/.test(file)) compiled = null;
			};
			server.watcher.on('add', invalidate);
			server.watcher.on('unlink', invalidate);
			server.watcher.on('change', invalidate);

			server.middlewares.use((req, res, next) => {
				if (!req.url) return next();
				if (!compiled) {
					compiled = compileDevRedirects(server.config.root, redirectOptions);
					for (const warning of compiled.warnings) {
						server.config.logger.warn(`[brixter] redirects: ${warning}`);
					}
				}
				const hit = resolveDevRedirect(compiled, req.url, redirectOptions.trailingSlash);
				if (!hit) return next();
				res.statusCode = hit.status;
				res.setHeader('location', hit.location);
				res.end();
			});
		}
	};
}

function resolveTypesPath(option: string | undefined, root: string): string {
	const target = option ?? '$lib/brixter/brixter.generated.d.ts';
	if (target.startsWith('$lib/')) return path.join(root, 'src', 'lib', target.slice('$lib/'.length));
	return path.resolve(root, target);
}

function describe(issues: SchemaIssue[]): string {
	return `[brixter] ${new SchemaError(issues).message}`;
}

function toPosix(value: string): string {
	return value.split(path.sep).join('/');
}
