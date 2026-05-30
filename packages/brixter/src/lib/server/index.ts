/**
 * Public server-side surface of the brixter package.
 * Import as: `import { ... } from 'brixter/server'`.
 */

export {
	configureBrixter,
	getConfig,
	type BrixterConfig,
	type BrixterGitHubConfig,
	type ResolvedBrixterConfig
} from './config.ts';

export { getDb } from './db.ts';
export { getAuth, type BrixterAuth } from './auth.ts';
export { handle } from './handle.ts';
export { getOctokit, getRepo, type RepoTarget } from './github.ts';
export { getRepoConfig, updateRepoConfig, type RepoConfig } from './repo-config.ts';
export { isSetupComplete } from './setup.ts';
export { migrate, type MigrateOptions, type MigrateResult } from './migrate.ts';
