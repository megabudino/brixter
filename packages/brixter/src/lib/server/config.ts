import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface BrixterGitHubConfig {
	appId: string;
	privateKey: string;
	installationId: string;
	repoOwner: string;
	repoName: string;
	defaultBranch: string;
}

/**
 * User-supplied overrides. Every field is optional: anything missing
 * falls back to the matching env var. Passed through `configureBrixter`.
 */
export interface BrixterConfig {
	/** SQLite file path. Default: `data/brixter.db`. Env: `DATABASE_URL`. */
	databaseUrl?: string;
	/** Public origin of the deployment, used as BetterAuth `baseURL`. Env: `ORIGIN`. */
	origin?: string;
	/** Secret for BetterAuth. Env: `BRIXTER_AUTH_SECRET`. */
	authSecret?: string;
	/** Mount path for the CMS routes. Default: `/admin`. Env: `BRIXTER_ADMIN_PATH`. */
	adminPath?: string;
	/** SvelteKit app root, relative to the GitHub repo root. Env: `BRIXTER_APP_ROOT`. */
	appRoot?: string;
	/** SvelteKit routes directory, relative to the GitHub repo root. Env: `BRIXTER_ROUTES_ROOT`. */
	routesRoot?: string;
	/** GitHub App credentials and target repo. */
	github?: Partial<BrixterGitHubConfig>;
}

export interface ResolvedBrixterConfig {
	databaseUrl: string;
	origin: string;
	authSecret: string;
	adminPath: string;
	appRoot: string;
	routesRoot: string;
	github: BrixterGitHubConfig;
}

export type ResolvedBrixterCoreConfig = Omit<ResolvedBrixterConfig, 'github'>;

interface BuildRepoInfo {
	repo: string | undefined;
	repoOwner: string | undefined;
	repoName: string | undefined;
	defaultBranch: string | undefined;
	commit: string | undefined;
	appRoot: string | undefined;
	routesRoot: string | undefined;
}

declare const __BRIXTER_BUILD_REPO__: string | null | undefined;
declare const __BRIXTER_BUILD_REPO_OWNER__: string | null | undefined;
declare const __BRIXTER_BUILD_REPO_NAME__: string | null | undefined;
declare const __BRIXTER_BUILD_DEFAULT_BRANCH__: string | null | undefined;
declare const __BRIXTER_BUILD_COMMIT__: string | null | undefined;
declare const __BRIXTER_BUILD_APP_ROOT__: string | null | undefined;
declare const __BRIXTER_BUILD_ROUTES_ROOT__: string | null | undefined;

let overrides: BrixterConfig = {};
let cachedCore: ResolvedBrixterCoreConfig | null = null;
let cached: ResolvedBrixterConfig | null = null;
let envFile: Record<string, string> | null = null;

function loadEnvFile(): Record<string, string> {
	if (envFile) return envFile;
	envFile = {};

	const path = resolve(process.cwd(), '.env');
	if (!existsSync(path)) return envFile;

	const lines = readFileSync(path, 'utf-8').split(/\r?\n/);
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (!line || line.trimStart().startsWith('#')) continue;

		const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
		if (!match) continue;

		const key = match[1];
		let value = match[2].trim();
		if (value.startsWith('"')) {
			value = value.slice(1);
			while (!value.endsWith('"') && i < lines.length - 1) {
				i++;
				value += `\n${lines[i]}`;
			}
			if (value.endsWith('"')) value = value.slice(0, -1);
			value = value.replace(/\\n/g, '\n');
		}

		envFile[key] = value;
	}

	return envFile;
}

function envValue(key: string): string | undefined {
	const viteEnv = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
	return viteEnv?.[key] ?? process.env[key] ?? loadEnvFile()[key];
}

/**
 * Provide explicit configuration. Optional: by default every value is read
 * from `$env/dynamic/private`. Call once at boot (typically inside the
 * Vite plugin or before the SvelteKit handle runs).
 */
export function configureBrixter(config: BrixterConfig): void {
	overrides = config;
	cachedCore = null;
	cached = null;
}

function required(value: string | undefined, name: string): string {
	if (!value) {
		throw new Error(
			`brixter: missing required config "${name}". ` +
				`Set the ${name} env var or pass it to configureBrixter().`
		);
	}
	return value;
}

function present(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
}

function parseRepoFullName(value: string | undefined): { owner: string; name: string } | undefined {
	const match = value?.match(/^([^/]+)\/([^/]+)$/);
	if (!match) return undefined;
	return { owner: match[1], name: match[2] };
}

function normalizeRepoPath(value: string | undefined): string | undefined {
	const trimmed = value?.trim().replace(/^\/+|\/+$/g, '');
	return trimmed ? trimmed : undefined;
}

function routesRootForApp(appRoot: string): string {
	return [appRoot, 'src/routes'].filter(Boolean).join('/');
}

function getBuildRepoInfo(): BuildRepoInfo {
	const repo =
		present(typeof __BRIXTER_BUILD_REPO__ === 'string' ? __BRIXTER_BUILD_REPO__ : undefined) ??
		present(envValue('BRIXTER_SOURCE_REPO'));
	const parsed = parseRepoFullName(repo);

	return {
		repo,
		repoOwner:
			present(
				typeof __BRIXTER_BUILD_REPO_OWNER__ === 'string' ? __BRIXTER_BUILD_REPO_OWNER__ : undefined
			) ?? parsed?.owner,
		repoName:
			present(
				typeof __BRIXTER_BUILD_REPO_NAME__ === 'string' ? __BRIXTER_BUILD_REPO_NAME__ : undefined
			) ?? parsed?.name,
		defaultBranch:
			present(
				typeof __BRIXTER_BUILD_DEFAULT_BRANCH__ === 'string'
					? __BRIXTER_BUILD_DEFAULT_BRANCH__
					: undefined
			) ?? present(envValue('BRIXTER_SOURCE_DEFAULT_BRANCH')),
		commit:
			present(
				typeof __BRIXTER_BUILD_COMMIT__ === 'string' ? __BRIXTER_BUILD_COMMIT__ : undefined
			) ?? present(envValue('BRIXTER_SOURCE_COMMIT')),
		appRoot:
			normalizeRepoPath(
				typeof __BRIXTER_BUILD_APP_ROOT__ === 'string' ? __BRIXTER_BUILD_APP_ROOT__ : undefined
			) ?? normalizeRepoPath(envValue('BRIXTER_APP_ROOT')),
		routesRoot:
			normalizeRepoPath(
				typeof __BRIXTER_BUILD_ROUTES_ROOT__ === 'string'
					? __BRIXTER_BUILD_ROUTES_ROOT__
					: undefined
			) ?? normalizeRepoPath(envValue('BRIXTER_ROUTES_ROOT'))
	};
}

function assertRepoMatchesBuild(config: BrixterGitHubConfig, build: BuildRepoInfo): void {
	if (!build.repo) return;

	const configuredRepo = `${config.repoOwner}/${config.repoName}`;
	if (configuredRepo.toLowerCase() !== build.repo.toLowerCase()) {
		throw new Error(
			`brixter: configured GitHub repo "${configuredRepo}" does not match ` +
				`the repo that produced this build "${build.repo}".`
		);
	}
}

/**
 * Resolve and cache configuration that does not require a GitHub repo.
 */
export function getCoreConfig(): ResolvedBrixterCoreConfig {
	if (cachedCore) return cachedCore;

	const build = getBuildRepoInfo();
	const appRoot = normalizeRepoPath(overrides.appRoot) ?? build.appRoot ?? '';
	const routesRoot =
		normalizeRepoPath(overrides.routesRoot) ?? build.routesRoot ?? routesRootForApp(appRoot);

	cachedCore = {
		databaseUrl: overrides.databaseUrl ?? present(envValue('DATABASE_URL')) ?? 'data/brixter.db',
		origin: required(overrides.origin ?? present(envValue('ORIGIN')), 'ORIGIN'),
		authSecret: required(
			overrides.authSecret ?? present(envValue('BRIXTER_AUTH_SECRET')),
			'BRIXTER_AUTH_SECRET'
		),
		adminPath: overrides.adminPath ?? present(envValue('BRIXTER_ADMIN_PATH')) ?? '/admin',
		appRoot,
		routesRoot
	};
	return cachedCore;
}

/**
 * Resolve and cache the merged configuration. First call wins:
 * subsequent calls return the same object. Throws if a required
 * value is missing.
 */
export function getConfig(): ResolvedBrixterConfig {
	if (cached) return cached;

	const core = getCoreConfig();
	const gh = overrides.github ?? {};
	const buildRepo = getBuildRepoInfo();

	cached = {
		...core,
		github: {
			appId: required(gh.appId ?? present(envValue('GITHUB_APP_ID')), 'GITHUB_APP_ID'),
			privateKey: required(
				gh.privateKey ?? present(envValue('GITHUB_PRIVATE_KEY')),
				'GITHUB_PRIVATE_KEY'
			),
			installationId: required(
				gh.installationId ?? present(envValue('GITHUB_INSTALLATION_ID')),
				'GITHUB_INSTALLATION_ID'
			),
			repoOwner: required(
				gh.repoOwner ?? present(envValue('GITHUB_REPO_OWNER')) ?? buildRepo.repoOwner,
				'GITHUB_REPO_OWNER'
			),
			repoName: required(
				gh.repoName ?? present(envValue('GITHUB_REPO_NAME')) ?? buildRepo.repoName,
				'GITHUB_REPO_NAME'
			),
			defaultBranch:
				gh.defaultBranch ??
				present(envValue('GITHUB_DEFAULT_BRANCH')) ??
				buildRepo.defaultBranch ??
				'main'
		}
	};
	assertRepoMatchesBuild(cached.github, buildRepo);
	return cached;
}
