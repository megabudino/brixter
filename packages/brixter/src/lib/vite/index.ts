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
}

interface BuildRepoInfo {
	repo: string | undefined;
	repoOwner: string | undefined;
	repoName: string | undefined;
	defaultBranch: string | undefined;
	commit: string | undefined;
	appRoot: string | undefined;
	routesRoot: string | undefined;
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
		routesRoot: appRoot === undefined ? undefined : routesRootForApp(appRoot)
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
		config(userConfig, env) {
			const root = path.resolve(userConfig.root ?? process.cwd());
			const buildRepo = readBuildRepoInfo(root);
			const appRoot = normalizeRepoPath(options.appRoot) ?? buildRepo.appRoot ?? '';
			const routesRoot =
				normalizeRepoPath(options.routesRoot) ?? buildRepo.routesRoot ?? routesRootForApp(appRoot);
			const build = { ...buildRepo, appRoot, routesRoot };
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
					__BRIXTER_BUILD_ROUTES_ROOT__: defineValue(build.routesRoot)
				},
				ssr: {
					noExternal: ['brixter', 'lucide-svelte']
				}
			};
		}
	};
}
