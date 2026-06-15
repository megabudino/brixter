import { error, redirect, type RequestEvent } from '@sveltejs/kit';
import { getConfig, type ResolvedBrixterConfig } from '../../server/config.ts';
import { getContentStore, isLocalMode } from '../../server/content-store.ts';
import {
	findRouteNode,
	getExplorerListing,
	childDirNames,
	childPageNames,
	routeBreadcrumbs,
	routeDirUrlPath,
	routePageUrlPath,
	resolveRouteUrlPath,
	isWithinRepoRoot,
	normalizeRepoPath,
	type RouteNode
} from '../../server/sveltekit-routes.ts';
import { getBranchRouteSnapshot } from '../repo-cache.ts';
import {
	defaultBranchForConfig,
	ensureDraftBranch,
	isBrixYamlFile,
	parentPathFor,
	parentPathForPage,
	repoMeta,
	syncDraftWithDefaultBranch,
	type PageMatch
} from '../shared.ts';

async function loadBranchFile(filePath: string): Promise<Record<string, unknown>> {
	const store = getContentStore();
	const result = await store.readFile(filePath);

	let brixYaml: string | undefined;

	const raw = result.content;
	const fileName = filePath.split('/').pop() ?? filePath;

	if (isBrixYamlFile(fileName)) {
		brixYaml = raw;
	}

	return {
		file: {
			name: fileName,
			path: filePath,
			sha: result.sha,
			downloadUrl: result.downloadUrl,
			size: result.size,
			brixYaml
		}
	};
}

export async function loadBranch({ locals }: RequestEvent, match: PageMatch) {
	if (!locals.user) throw redirect(302, '/admin/login');
	if (match.branch !== getContentStore().branch) throw redirect(302, '/admin/routes');

	const mediaDir = normalizeRepoPath(getConfig().mediaDir) ?? '';
	const routesRoot = normalizeRepoPath(getConfig().routesRoot);
	const defaultBranch = defaultBranchForConfig();
	const branch = match.branch!;
	await ensureDraftBranch();

	let routeTree: RouteNode;
	let behindBy = 0;
	let aheadBy = 0;
	let syncError: string | undefined;
	try {
		const sync = await syncDraftWithDefaultBranch(defaultBranch);
		behindBy = sync.behindBy;
		aheadBy = sync.aheadBy;
		syncError = sync.syncError;
		({ routeTree } = await getBranchRouteSnapshot(branch, routesRoot));
	} catch (err: unknown) {
		const e = err as {
			status?: number;
			response?: { status?: number; data?: { message?: string } };
		};
		if (e.status) throw err;
		throw error(e.response?.status ?? 500, e.response?.data?.message ?? 'Failed to load contents');
	}

	let routeRequest: ReturnType<typeof resolveRouteUrlPath>;
	try {
		routeRequest = resolveRouteUrlPath(routeTree, match.path ?? '');
	} catch {
		throw error(404, 'Not found');
	}
	const currentRouteDir = routeRequest.dirPath;

	if (!isWithinRepoRoot(currentRouteDir, routesRoot)) throw error(403, 'Access denied');

	const rm = repoMeta();
	const repoMetaObj = { name: rm.name, fullName: rm.fullName, mediaPath: mediaDir, routesRoot };

	if (routeRequest.kind === 'page') {
		const currentNode = findRouteNode(routeTree, currentRouteDir);
		const pageFile = currentNode?.page;
		if (!pageFile) throw error(404, 'Not found');

		let filePayload: Record<string, unknown>;
		try {
			filePayload = await loadBranchFile(pageFile.filePath);
		} catch (err: unknown) {
			const e = err as {
				status?: number;
				response?: { status?: number; data?: { message?: string } };
			};
			if (e.status) throw err;
			throw error(
				e.response?.status ?? 500,
				e.response?.data?.message ?? 'Failed to load contents'
			);
		}

		const file = filePayload.file as { path: string };
		return {
			repo: repoMetaObj,
			branch,
			defaultBranch,
			filePath: pageFile.filePath,
			explorerRoot: routesRoot,
			parentPath: parentPathForPage(file.path, routeTree),
			breadcrumbs: routeBreadcrumbs(routeTree, file.path),
			...filePayload,
			entries: [],
			childDirNames: [],
			childPageNames: [],
			behindBy,
			aheadBy,
			syncError,
			isLocal: isLocalMode()
		};
	}

	const currentNode = findRouteNode(routeTree, currentRouteDir);
	if (!currentNode) throw error(404, 'Not found');

	return {
		repo: repoMetaObj,
		branch,
		defaultBranch,
		filePath: currentRouteDir,
		explorerRoot: routesRoot,
		parentPath: routeRequest.path ? parentPathFor(currentRouteDir, routeTree) : null,
		breadcrumbs: routeBreadcrumbs(routeTree, currentRouteDir),
		entries: getExplorerListing(routeTree, currentRouteDir),
		childDirNames: childDirNames(routeTree, currentRouteDir),
		childPageNames: childPageNames(routeTree, currentRouteDir),
		behindBy,
		aheadBy,
		syncError,
		isLocal: isLocalMode()
	};
}