/**
 * `brixter/sveltekit/redirects` — the build-time redirect system.
 *
 * A page that replaced an old URL declares that URL in its front matter:
 *
 *     title: Pricing
 *     aliases:
 *       - /plans
 *       - path: /old-pricing
 *         status: 302
 *
 * Wrap your adapter and every alias on the site compiles into one map, emitted
 * in that adapter's native format:
 *
 *     import adapter from '@sveltejs/adapter-vercel';
 *     import { withRedirects } from 'brixter/sveltekit/redirects';
 *
 *     export default { kit: { adapter: withRedirects(adapter()) } };
 *
 * The redirects are then served by the hosting layer with real status codes,
 * before any application code runs — never as a meta refresh.
 *
 * The wrapper runs inside `adapt`, where both the content tree and SvelteKit's
 * route manifest are available, so a redirect that collides with a route, is
 * claimed twice, points nowhere or loops fails the build with the file that
 * declares it, instead of reaching production as a dead URL.
 */
import path from 'node:path';
import type { Adapter, Builder } from '@sveltejs/kit';
import {
	compileRedirects,
	pageAliasSource,
	RedirectCompileError,
	type AliasPage,
	type RedirectRule,
	type RedirectSource,
	type RedirectStatus
} from '@brixter/core/redirects';
import { scanBrixPages, scanStaticAssets } from './scan.ts';
import {
	REDIRECT_TARGETS,
	resolveOutDir,
	targetFromAdapter,
	targetFromEnv,
	writeRedirects,
	type RedirectTarget
} from './targets.ts';

export { scanBrixPages, scanRoutes, scanStaticAssets, type ScannedPage } from './scan.ts';
export {
	REDIRECT_TARGETS,
	resolveOutDir,
	targetFromAdapter,
	targetFromEnv,
	writeRedirects,
	type RedirectTarget
} from './targets.ts';

/** What a source factory is given, so it can resolve paths against the project. */
export interface RedirectSourceContext {
	/** Absolute path to the project root. */
	root: string;
	/** Absolute path to the routes directory. */
	routesDir: string;
	/** Every `+page.md` found on the site. */
	pages: AliasPage[];
}

export interface RedirectsOptions {
	/**
	 * Deployment format to emit. Detected from the adapter's name, falling back
	 * to the build environment (which is how `adapter-auto` decides too). Set it
	 * explicitly when you deploy static output to a platform the adapter can't
	 * name — `adapter-static` on Netlify, say.
	 */
	target?: RedirectTarget;
	/**
	 * Directory holding the deployment output, relative to the project root.
	 * Defaults to the target's own convention (`netlify.toml`'s `publish` for
	 * Netlify, `.vercel/output` for Vercel, `.svelte-kit/cloudflare` for
	 * Cloudflare).
	 */
	outDir?: string;
	/**
	 * Additional rule sources, beyond the site's page `aliases` — a central
	 * project file, an export from a legacy CMS. They are compiled together with
	 * the page aliases, under the same consistency rules.
	 */
	sources?:
		| RedirectSource[]
		| ((context: RedirectSourceContext) => RedirectSource[] | Promise<RedirectSource[]>);
	/** Trailing-slash policy applied to every path. Defaults to `'never'`. */
	trailingSlash?: 'never' | 'always';
	/** Status used by an alias that doesn't name one. Defaults to `301`. */
	defaultStatus?: RedirectStatus;
	/**
	 * Compile and validate, but write nothing. Useful to keep the consistency
	 * checks in a build that ships redirects some other way.
	 */
	emit?: boolean;
}

/**
 * A page with no single URL still gets a rule, carrying its route id as the
 * destination — the compiler rejects that with a message naming the file,
 * which beats dropping an alias an author deliberately wrote.
 */
function toAliasPages(pages: ReturnType<typeof scanBrixPages>): AliasPage[] {
	return pages.map((page) => ({
		file: page.file,
		url: page.url ?? page.routeId,
		frontmatter: page.frontmatter
	}));
}

async function resolveSources(
	options: RedirectsOptions,
	context: RedirectSourceContext
): Promise<RedirectSource[]> {
	const pageAliases = pageAliasSource(context.pages);
	const extra =
		typeof options.sources === 'function' ? await options.sources(context) : options.sources;
	// A list from the start: page aliases are the first source, not the only
	// shape the compiler knows.
	return [pageAliases, ...(extra ?? [])];
}

/** Compile the site's redirects. Throws, with file-anchored detail, on any inconsistency. */
export async function collectRedirects(
	builder: Builder,
	options: RedirectsOptions = {},
	root = process.cwd()
): Promise<RedirectRule[]> {
	const routesDir = path.resolve(root, builder.config.kit.files.routes);
	const assetsDir = path.resolve(root, builder.config.kit.files.assets);
	const pages = toAliasPages(scanBrixPages(routesDir, root));

	const sources = await resolveSources(options, { root, routesDir, pages });

	return compileRedirects({
		sources,
		// SvelteKit's own manifest: the authority on what the app already serves.
		routes: builder.routes.map((route) => ({ id: route.id, pattern: route.pattern })),
		knownPaths: [...builder.prerendered.paths, ...scanStaticAssets(assetsDir)],
		trailingSlash: options.trailingSlash,
		defaultStatus: options.defaultStatus
	});
}

function resolveTarget(adapterName: string, options: RedirectsOptions): RedirectTarget {
	const target = options.target ?? targetFromAdapter(adapterName) ?? targetFromEnv(process.env);
	if (target) return target;
	throw new Error(
		`[brixter] redirects: cannot tell which deployment format \`${adapterName}\` produces. ` +
			`Set \`target\` on withRedirects() to one of ${REDIRECT_TARGETS.join(', ')}. ` +
			`Redirects are only ever emitted for a hosting layer that serves them with a real ` +
			`status code — brixter will not fall back to a meta refresh.`
	);
}

/**
 * Wrap an adapter so the site's redirects are compiled, validated against the
 * route manifest, and written into its build output.
 */
export function withRedirects(adapter: Adapter, options: RedirectsOptions = {}): Adapter {
	return {
		...adapter,
		name: `${adapter.name} (brixter redirects)`,
		async adapt(builder: Builder) {
			const root = process.cwd();

			// Compile before the adapter runs: an inconsistent redirect should stop
			// the build immediately, not after a deployment bundle has been built.
			let redirects: RedirectRule[];
			try {
				redirects = await collectRedirects(builder, options, root);
			} catch (error) {
				if (error instanceof RedirectCompileError) {
					throw new Error(`[brixter] redirects: ${error.message}`, { cause: error });
				}
				throw error;
			}

			const target = options.emit === false ? null : resolveTarget(adapter.name, options);

			await adapter.adapt(builder);

			if (!target) {
				builder.log.minor(`[brixter] compiled ${redirects.length} redirect(s); emitting disabled`);
				return;
			}

			const outDir = resolveOutDir(target, root, options.outDir);
			if (!outDir) {
				throw new Error(
					`[brixter] redirects: could not find the ${target} build output under ${root}. ` +
						`Pass \`outDir\` to withRedirects() with the directory ${adapter.name} writes to.`
				);
			}

			const { file, count } = writeRedirects(target, redirects, outDir);
			builder.log.minor(
				`[brixter] wrote ${count} redirect(s) to ${path.relative(root, file)} (${target})`
			);
		}
	};
}
