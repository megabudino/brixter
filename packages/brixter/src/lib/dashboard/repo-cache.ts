import { getOctokit, getRepo } from '../server/github.ts';
import {
	buildSvelteKitRouteTree,
	type RouteNode,
	type TreeEntry
} from '../server/sveltekit-routes.ts';

const ROUTE_CACHE_TTL_MS = 30_000;
const BRANCH_STATUS_CACHE_TTL_MS = 30_000;

export interface BranchRouteSnapshot {
	tree: TreeEntry[];
	routeTree: RouteNode;
	fetchedAt: number;
}

interface RouteCacheEntry {
	expiresAt: number;
	snapshot: BranchRouteSnapshot;
}

const routeCache = new Map<string, RouteCacheEntry>();
const inflightRouteFetches = new Map<string, Promise<BranchRouteSnapshot>>();
const branchStatusCache = new Map<string, { expiresAt: number; behindBy: number }>();
const inflightBranchStatusFetches = new Map<string, Promise<number>>();

function normalizeTreeEntries(tree: Array<{ path?: string; type?: string }>): TreeEntry[] {
	return tree
		.filter((item) => item.type === 'tree' || item.type === 'blob')
		.map((item) => ({
			path: item.path as string,
			type: item.type as 'tree' | 'blob'
		}));
}

function cacheKey(branch: string, routesRoot: string): string {
	const repo = getRepo();
	return `${repo.fullName}:${branch}:${routesRoot}`;
}

function branchStatusCacheKey(branch: string, defaultBranch: string): string {
	const repo = getRepo();
	return `${repo.fullName}:${branch}:${defaultBranch}`;
}

async function fetchRepoTree(branch: string): Promise<TreeEntry[]> {
	const octokit = getOctokit();
	const repo = getRepo();

	try {
		const { data: tree } = await octokit.request('GET /repos/{owner}/{repo}/git/trees/{tree_sha}', {
			owner: repo.owner,
			repo: repo.name,
			tree_sha: branch,
			recursive: '1'
		});
		return normalizeTreeEntries(tree.tree);
	} catch (err: unknown) {
		const e = err as { status?: number; response?: { status?: number } };
		const status = e.status ?? e.response?.status;
		if (status !== 404 && status !== 422) throw err;
	}

	const { data: ref } = await octokit.request('GET /repos/{owner}/{repo}/git/ref/{ref}', {
		owner: repo.owner,
		repo: repo.name,
		ref: `heads/${branch}`
	});

	const { data: commit } = await octokit.request(
		'GET /repos/{owner}/{repo}/git/commits/{commit_sha}',
		{
			owner: repo.owner,
			repo: repo.name,
			commit_sha: ref.object.sha
		}
	);

	const { data: tree } = await octokit.request('GET /repos/{owner}/{repo}/git/trees/{tree_sha}', {
		owner: repo.owner,
		repo: repo.name,
		tree_sha: commit.tree.sha,
		recursive: '1'
	});

	return normalizeTreeEntries(tree.tree);
}

export function invalidateBranchRouteCache(branch?: string): void {
	if (!branch) {
		routeCache.clear();
		inflightRouteFetches.clear();
		branchStatusCache.clear();
		inflightBranchStatusFetches.clear();
		return;
	}

	const repo = getRepo();
	const prefix = `${repo.fullName}:${branch}:`;
	for (const key of routeCache.keys()) {
		if (key.startsWith(prefix)) routeCache.delete(key);
	}
	for (const key of inflightRouteFetches.keys()) {
		if (key.startsWith(prefix)) inflightRouteFetches.delete(key);
	}
	for (const key of branchStatusCache.keys()) {
		if (key.startsWith(prefix)) branchStatusCache.delete(key);
	}
	for (const key of inflightBranchStatusFetches.keys()) {
		if (key.startsWith(prefix)) inflightBranchStatusFetches.delete(key);
	}
}

export async function getBranchBehindBy(branch: string, defaultBranch: string): Promise<number> {
	if (branch === defaultBranch) return 0;

	const key = branchStatusCacheKey(branch, defaultBranch);
	const now = Date.now();
	const cached = branchStatusCache.get(key);
	if (cached && cached.expiresAt > now) return cached.behindBy;

	const inflight = inflightBranchStatusFetches.get(key);
	if (inflight) return inflight;

	const promise = (async () => {
		const octokit = getOctokit();
		const repo = getRepo();
		try {
			const { data: comparison } = await octokit.request(
				'GET /repos/{owner}/{repo}/compare/{basehead}',
				{
					owner: repo.owner,
					repo: repo.name,
					basehead: `${branch}...${defaultBranch}`
				}
			);
			const behindBy = comparison.ahead_by;
			branchStatusCache.set(key, {
				expiresAt: Date.now() + BRANCH_STATUS_CACHE_TTL_MS,
				behindBy
			});
			return behindBy;
		} catch {
			return 0;
		}
	})().finally(() => {
		inflightBranchStatusFetches.delete(key);
	});

	inflightBranchStatusFetches.set(key, promise);
	return promise;
}

export async function getBranchRouteSnapshot(
	branch: string,
	routesRoot: string
): Promise<BranchRouteSnapshot> {
	const key = cacheKey(branch, routesRoot);
	const now = Date.now();
	const cached = routeCache.get(key);
	if (cached && cached.expiresAt > now) return cached.snapshot;

	const inflight = inflightRouteFetches.get(key);
	if (inflight) return inflight;

	const promise = fetchRepoTree(branch)
		.then((tree) => {
			const snapshot = {
				tree,
				routeTree: buildSvelteKitRouteTree(tree, routesRoot),
				fetchedAt: Date.now()
			};
			routeCache.set(key, {
				expiresAt: Date.now() + ROUTE_CACHE_TTL_MS,
				snapshot
			});
			return snapshot;
		})
		.finally(() => {
			inflightRouteFetches.delete(key);
		});

	inflightRouteFetches.set(key, promise);
	return promise;
}

export function warmBranchRouteSnapshot(branch: string, routesRoot: string): void {
	void getBranchRouteSnapshot(branch, routesRoot).catch(() => {
		// Best-effort warmup; interactive loads surface real errors.
	});
}
