import { error, redirect, type RequestEvent } from '@sveltejs/kit';
import { getContentStore, isLocalMode } from '../../server/content-store.ts';
import { defaultBranchForConfig, ensureDraftBranch, repoMeta, type PageMatch } from '../shared.ts';
import { getBranchStatus } from '../repo-cache.ts';

export async function loadPublish({ locals }: RequestEvent, match: PageMatch) {
	if (!locals.user) throw redirect(302, '/admin/login');
	if (match.branch !== getContentStore().branch) throw redirect(302, '/admin/routes');

	const defaultBranch = defaultBranchForConfig();
	const branch = getContentStore().branch;
	await ensureDraftBranch();

	const { aheadBy, behindBy } = await getBranchStatus(branch, defaultBranch);
	if (aheadBy === 0) throw redirect(302, '/admin/routes');

	if (isLocalMode()) {
		return {
			repo: { name: repoMeta().name, fullName: repoMeta().fullName },
			branch,
			defaultBranch,
			aheadBy,
			behindBy,
			totalCommits: 0,
			files: []
		};
	}

	const { getOctokit, getRepo } = await import('../../server/github.ts');
	const octokit = getOctokit();
	const repo = getRepo();

	let comparison: {
		total_commits: number;
		files?: Array<{
			filename: string;
			status: string;
			additions: number;
			deletions: number;
			patch?: string;
		}>;
	};

	try {
		const { data } = await octokit.request('GET /repos/{owner}/{repo}/compare/{basehead}', {
			owner: repo.owner,
			repo: repo.name,
			basehead: `${defaultBranch}...${branch}`
		});
		comparison = data;
	} catch (err: unknown) {
		const e = err as {
			status?: number;
			response?: { status?: number; data?: { message?: string } };
		};
		if (e.status) throw err;
		throw error(
			e.response?.status ?? 500,
			e.response?.data?.message ?? 'Failed to load comparison'
		);
	}

	const files = (comparison.files ?? []).map((file) => ({
		filename: file.filename,
		status: file.status,
		additions: file.additions,
		deletions: file.deletions,
		patch: file.patch ?? ''
	}));

	return {
		repo: { name: repo.name, fullName: repo.fullName },
		branch,
		defaultBranch,
		aheadBy,
		behindBy,
		totalCommits: comparison.total_commits,
		files
	};
}