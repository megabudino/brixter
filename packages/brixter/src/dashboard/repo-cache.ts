import { getContentStore, type BranchStatus } from '../server/content-store.ts';
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

export type { BranchStatus };

const routeCache = new Map<string, RouteCacheEntry>();
const inflightRouteFetches = new Map<string, Promise<BranchRouteSnapshot>>();

const branchStatusCache = new Map<string, { expiresAt: number; status: BranchStatus }>();
const inflightBranchStatusFetches = new Map<string, Promise<BranchStatus>>();

function cacheKey(branch: string, routesRoot: string): string {
	return `${branch}:${routesRoot}`;
}

function branchStatusCacheKey(branch: string, defaultBranch: string): string {
	return `${branch}:${defaultBranch}`;
}

export function invalidateBranchRouteCache(branch?: string): void {
	if (!branch) {
		routeCache.clear();
		inflightRouteFetches.clear();
		branchStatusCache.clear();
		inflightBranchStatusFetches.clear();
		getContentStore().invalidateCache();
		return;
	}

	const prefix = `${branch}:`;
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
	getContentStore().invalidateCache();
}

export async function getBranchStatus(
	branch: string,
	defaultBranch: string
): Promise<BranchStatus> {
	if (branch === defaultBranch) return { behindBy: 0, aheadBy: 0 };

	const key = branchStatusCacheKey(branch, defaultBranch);
	const now = Date.now();
	const cached = branchStatusCache.get(key);
	if (cached && cached.expiresAt > now) return cached.status;

	const inflight = inflightBranchStatusFetches.get(key);
	if (inflight) return inflight;

	const store = getContentStore();
	const promise = store.getStatus()
		.then((status) => {
			branchStatusCache.set(key, {
				expiresAt: Date.now() + BRANCH_STATUS_CACHE_TTL_MS,
				status
			});
			return status;
		})
		.finally(() => {
			inflightBranchStatusFetches.delete(key);
		});

	inflightBranchStatusFetches.set(key, promise);
	return promise;
}

export async function getBranchBehindBy(branch: string, defaultBranch: string): Promise<number> {
	const status = await getBranchStatus(branch, defaultBranch);
	return status.behindBy;
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

	const store = getContentStore();
	const promise = store.getTree(routesRoot)
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
