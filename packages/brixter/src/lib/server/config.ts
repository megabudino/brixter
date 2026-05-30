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
	/** GitHub App credentials and target repo. */
	github?: Partial<BrixterGitHubConfig>;
}

export interface ResolvedBrixterConfig {
	databaseUrl: string;
	origin: string;
	authSecret: string;
	adminPath: string;
	github: BrixterGitHubConfig;
}

let overrides: BrixterConfig = {};
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

/**
 * Resolve and cache the merged configuration. First call wins:
 * subsequent calls return the same object. Throws if a required
 * value is missing.
 */
export function getConfig(): ResolvedBrixterConfig {
	if (cached) return cached;

	const gh = overrides.github ?? {};

	cached = {
		databaseUrl: overrides.databaseUrl ?? envValue('DATABASE_URL') ?? 'data/brixter.db',
		origin: required(overrides.origin ?? envValue('ORIGIN'), 'ORIGIN'),
		authSecret: required(
			overrides.authSecret ?? envValue('BRIXTER_AUTH_SECRET'),
			'BRIXTER_AUTH_SECRET'
		),
		adminPath: overrides.adminPath ?? envValue('BRIXTER_ADMIN_PATH') ?? '/admin',
		github: {
			appId: required(gh.appId ?? envValue('GITHUB_APP_ID'), 'GITHUB_APP_ID'),
			privateKey: required(gh.privateKey ?? envValue('GITHUB_PRIVATE_KEY'), 'GITHUB_PRIVATE_KEY'),
			installationId: required(
				gh.installationId ?? envValue('GITHUB_INSTALLATION_ID'),
				'GITHUB_INSTALLATION_ID'
			),
			repoOwner: required(gh.repoOwner ?? envValue('GITHUB_REPO_OWNER'), 'GITHUB_REPO_OWNER'),
			repoName: required(gh.repoName ?? envValue('GITHUB_REPO_NAME'), 'GITHUB_REPO_NAME'),
			defaultBranch: gh.defaultBranch ?? envValue('GITHUB_DEFAULT_BRANCH') ?? 'main'
		}
	};
	return cached;
}
