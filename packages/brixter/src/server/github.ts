import { Octokit } from '@octokit/core';
import { createAppAuth } from '@octokit/auth-app';
import { getConfig } from './config.ts';

export interface RepoTarget {
	owner: string;
	name: string;
	defaultBranch: string;
	fullName: string;
}

let octokitInstance: Octokit | null = null;
let repoInstance: RepoTarget | null = null;

/**
 * Lazily build the Octokit client authenticated as the configured GitHub App
 * installation. Cached for the process lifetime.
 */
export function getOctokit(): Octokit {
	if (octokitInstance) return octokitInstance;
	const { github } = getConfig();
	octokitInstance = new Octokit({
		authStrategy: createAppAuth,
		auth: {
			appId: github.appId,
			privateKey: github.privateKey,
			installationId: github.installationId
		}
	});
	return octokitInstance;
}

/**
 * The repo this brixter instance manages, derived from config.
 */
export function getRepo(): RepoTarget {
	if (repoInstance) return repoInstance;
	const { github } = getConfig();
	repoInstance = {
		owner: github.repoOwner,
		name: github.repoName,
		defaultBranch: github.defaultBranch,
		fullName: `${github.repoOwner}/${github.repoName}`
	};
	return repoInstance;
}
