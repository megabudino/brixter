/**
 * Vite plugin for brixter.
 *
 * Route mounting is handled by the consumer's SvelteKit `reroute` hook and a
 * hidden catch-all route. The plugin only carries Vite-level integration
 * details that cannot live in SvelteKit route modules.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { loadEnv, type Plugin } from 'vite';
import yaml from 'yaml';

const { parse: parseYaml } = yaml;

export interface BrixterPluginOptions {
	/**
	 * Mount path for the CMS inside the consumer's app.
	 *
	 * @default '/admin'
	 */
	adminPath?: string;
	/**
	 * SvelteKit app root, relative to the GitHub repo root. Inferred from Vite
	 * root when omitted.
	 */
	appRoot?: string;
	/**
	 * SvelteKit routes directory, relative to the GitHub repo root.
	 *
	 * @default '<appRoot>/src/routes'
	 */
	routesRoot?: string;
	/**
	 * SvelteKit static directory, relative to the GitHub repo root.
	 *
	 * @default '<appRoot>/static'
	 */
	mediaDir?: string;
	/**
	 * Directory containing Svelte components referenced by `.brix.yaml` files.
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
}

interface BuildRepoInfo {
	repo: string | undefined;
	repoOwner: string | undefined;
	repoName: string | undefined;
	defaultBranch: string | undefined;
	commit: string | undefined;
	appRoot: string | undefined;
	routesRoot: string | undefined;
	mediaDir: string | undefined;
}

function git(cwd: string, args: string[]): string | undefined {
	try {
		return execFileSync('git', args, {
			cwd,
			encoding: 'utf-8',
			stdio: ['ignore', 'pipe', 'ignore']
		}).trim();
	} catch {
		return undefined;
	}
}

function parseGitHubRemote(value: string | undefined): { owner: string; name: string } | undefined {
	if (!value) return undefined;

	const normalized = value.trim().replace(/\.git$/, '');
	const httpsMatch = normalized.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)$/);
	if (httpsMatch) return { owner: httpsMatch[1], name: httpsMatch[2] };

	const sshMatch = normalized.match(/^git@github\.com:([^/]+)\/([^/]+)$/);
	if (sshMatch) return { owner: sshMatch[1], name: sshMatch[2] };

	return undefined;
}

function readBuildRepoInfo(root: string): BuildRepoInfo {
	const remote = parseGitHubRemote(git(root, ['remote', 'get-url', 'origin']));
	const defaultBranchRef = git(root, ['symbolic-ref', 'refs/remotes/origin/HEAD', '--short']);
	const defaultBranch = defaultBranchRef?.replace(/^origin\//, '');
	const repoRoot = git(root, ['rev-parse', '--show-toplevel']);
	const appRoot = repoRoot ? (normalizeRepoPath(path.relative(repoRoot, root)) ?? '') : undefined;

	return {
		repo: remote ? `${remote.owner}/${remote.name}` : undefined,
		repoOwner: remote?.owner,
		repoName: remote?.name,
		defaultBranch,
		commit: git(root, ['rev-parse', 'HEAD']),
		appRoot,
		routesRoot: appRoot === undefined ? undefined : routesRootForApp(appRoot),
		mediaDir: appRoot === undefined ? undefined : mediaDirForApp(appRoot)
	};
}

function defineValue(value: string | undefined): string {
	return JSON.stringify(value ?? null);
}

function present(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
}

function normalizeRepoPath(value: string | undefined): string | undefined {
	const trimmed = value
		?.trim()
		.replaceAll(path.sep, '/')
		.replace(/^\/+|\/+$/g, '');
	return trimmed ? trimmed : undefined;
}

function routesRootForApp(appRoot: string): string {
	return [appRoot, 'src/routes'].filter(Boolean).join('/');
}

function mediaDirForApp(appRoot: string): string {
	return [appRoot, 'static'].filter(Boolean).join('/');
}

function isBrixYaml(id: string): boolean {
	const file = id.split('?', 1)[0];
	return /\.brix\.ya?ml$/i.test(file);
}

function toComponentName(value: string): string {
	const normalized = value.trim().replace(/\.(svelte|ts|js)$/i, '');
	if (/^[A-Z][A-Za-z0-9]*$/.test(normalized)) return normalized;
	return normalized
		.split(/[-_\s/]+/)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join('');
}

function jsIdentifier(value: string): boolean {
	return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value);
}

function literal(value: unknown): string {
	return JSON.stringify(value ?? null, null, 2);
}

interface BrixDocument {
	components?: unknown;
	layout?: unknown;
	[key: string]: unknown;
}

function compileBrixYaml(source: string, options: BrixterPluginOptions): string {
	const parsed = parseYaml(source) as BrixDocument | null;
	const document = parsed && typeof parsed === 'object' ? parsed : {};
	const components = Array.isArray(document.components) ? document.components : [];
	const layout =
		typeof document.layout === 'string' && document.layout.trim()
			? document.layout.trim()
			: options.defaultLayout;
	const metadata = Object.fromEntries(
		Object.entries(document).filter(([key]) => key !== 'components' && key !== 'layout')
	);
	const metadataKeys = Object.keys(metadata).filter(jsIdentifier);
	const brixDir = options.brixDir ?? '$lib/brixter/brix';
	const layoutsDir = options.layoutsDir ?? '$lib/brixter/layouts';

	const imports: string[] = [];
	const blocks: string[] = [];
	const usedComponents = new Map<string, string>();

	components.forEach((component, index) => {
		if (!component || typeof component !== 'object') return;
		const spec = component as { type?: unknown; props?: unknown };
		if (typeof spec.type !== 'string' || !spec.type.trim()) return;

		const componentName = toComponentName(spec.type);
		if (!componentName) return;

		let importName = usedComponents.get(componentName);
		if (!importName) {
			importName = `Brix${usedComponents.size}`;
			usedComponents.set(componentName, importName);
			imports.push(`import ${importName} from '${brixDir}/${componentName}.svelte';`);
		}

		const propsName = `component${index}Props`;
		const props = spec.props && typeof spec.props === 'object' ? spec.props : {};
		blocks.push(`const ${propsName} = ${literal(props)};`);
		blocks.push(`<${importName} {...${propsName}} />`);
	});

	let layoutImport = '';
	let openingLayout = '';
	let closingLayout = '';
	if (layout) {
		const layoutName = toComponentName(layout);
		layoutImport = `import BrixLayout from '${layoutsDir}/${layoutName}.svelte';`;
		openingLayout = '<BrixLayout {metadata} {...metadata}>';
		closingLayout = '</BrixLayout>';
	}

	const componentScripts = blocks.filter((block) => block.startsWith('const ')).join('\n');
	const componentMarkup = blocks.filter((block) => !block.startsWith('const ')).join('\n');
	const destructured =
		metadataKeys.length > 0 ? `const { ${metadataKeys.join(', ')} } = metadata;` : '';

	return `<script module>
export const metadata = ${literal(metadata)};
</script>

<script>
${[layoutImport, ...imports, destructured, componentScripts].filter(Boolean).join('\n')}
</script>

${openingLayout}
${componentMarkup}
${closingLayout}
`;
}

function configuredRepo(env: Record<string, string>): string | undefined {
	const owner = present(env.GITHUB_REPO_OWNER);
	const name = present(env.GITHUB_REPO_NAME);
	return owner && name ? `${owner}/${name}` : undefined;
}

function assertConfiguredRepoMatchesBuild(
	configured: string | undefined,
	build: BuildRepoInfo
): void {
	if (!configured || !build.repo) return;

	if (configured.toLowerCase() !== build.repo.toLowerCase()) {
		throw new Error(
			`brixter: configured GitHub repo "${configured}" does not match ` +
				`the repo that produced this build "${build.repo}".`
		);
	}
}

function setBuildEnv(build: BuildRepoInfo): void {
	if (build.repo) process.env.BRIXTER_SOURCE_REPO ??= build.repo;
	if (build.defaultBranch) process.env.BRIXTER_SOURCE_DEFAULT_BRANCH ??= build.defaultBranch;
	if (build.commit) process.env.BRIXTER_SOURCE_COMMIT ??= build.commit;
	if (build.appRoot !== undefined) process.env.BRIXTER_APP_ROOT ??= build.appRoot;
	if (build.routesRoot) process.env.BRIXTER_ROUTES_ROOT ??= build.routesRoot;
	if (build.mediaDir) process.env.BRIXTER_MEDIA_DIR ??= build.mediaDir;
}

export function brixter(options: BrixterPluginOptions = {}): Plugin {
	const adminPath = options.adminPath ?? '/admin';
	if (adminPath !== '/admin') {
		console.warn(
			`brixter: adminPath="${adminPath}" is not officially supported in v0.1; ` +
				`dashboard links still hardcode "/admin". Pin to "/admin" until v0.2.`
		);
	}

	return {
		name: 'brixter',
		enforce: 'pre',
		config(userConfig, env) {
			const root = path.resolve(userConfig.root ?? process.cwd());
			const buildRepo = readBuildRepoInfo(root);
			const appRoot = normalizeRepoPath(options.appRoot) ?? buildRepo.appRoot ?? '';
			const routesRoot =
				normalizeRepoPath(options.routesRoot) ?? buildRepo.routesRoot ?? routesRootForApp(appRoot);
			const mediaDir =
				normalizeRepoPath(options.mediaDir) ?? buildRepo.mediaDir ?? mediaDirForApp(appRoot);
			const build = { ...buildRepo, appRoot, routesRoot, mediaDir };
			const loadedEnv = loadEnv(env.mode, root, '');
			assertConfiguredRepoMatchesBuild(configuredRepo(loadedEnv), build);
			setBuildEnv(build);

			return {
				define: {
					__BRIXTER_BUILD_REPO__: defineValue(build.repo),
					__BRIXTER_BUILD_REPO_OWNER__: defineValue(build.repoOwner),
					__BRIXTER_BUILD_REPO_NAME__: defineValue(build.repoName),
					__BRIXTER_BUILD_DEFAULT_BRANCH__: defineValue(build.defaultBranch),
					__BRIXTER_BUILD_COMMIT__: defineValue(build.commit),
					__BRIXTER_BUILD_APP_ROOT__: defineValue(build.appRoot),
					__BRIXTER_BUILD_ROUTES_ROOT__: defineValue(build.routesRoot),
					__BRIXTER_BUILD_MEDIA_DIR__: defineValue(build.mediaDir)
				},
				ssr: {
					// Keep the package source bundled for Svelte/lucide compatibility, but
					// leave native SQLite loading to Node. Bundling `better-sqlite3`
					// pulls in `bindings`, which relies on CommonJS globals like
					// `__filename` and crashes in ESM server chunks.
					noExternal: ['brixter', '@brixter/brix-builder', 'lucide-svelte'],
					external: ['better-sqlite3', 'bindings']
				}
			};
		},
		transform(code, id) {
			if (!isBrixYaml(id)) return null;
			return {
				code: compileBrixYaml(code, options),
				map: { mappings: '' }
			};
		}
	};
}
