import { fail, redirect, type RequestEvent } from '@sveltejs/kit';
import { getConfig } from '../../server/config.ts';
import { getContentStore } from '../../server/content-store.ts';
import { isWithinRepoRoot, normalizeRepoPath, type TreeEntry } from '../../server/sveltekit-routes.ts';
import { getBranchRouteSnapshot, invalidateBranchRouteCache } from '../repo-cache.ts';
import { matchPage } from '../shared.ts';

type RouteDeleteKind = 'page' | 'route';

function collectRouteDeletePaths(
	kind: RouteDeleteKind,
	routeDirPath: string,
	filePath: string | undefined,
	tree: TreeEntry[],
	routesRoot: string
): string[] {
	if (kind === 'page') {
		return filePath ? [filePath] : [];
	}

	if (routeDirPath === routesRoot) return [];

	const prefix = `${routeDirPath}/`;
	return tree
		.filter((entry) => entry.type === 'blob' && entry.path.startsWith(prefix))
		.map((entry) => entry.path);
}

export async function deleteRouteAction({ request, locals, url }: RequestEvent) {
	if (!locals.user) throw redirect(302, '/admin/login');

	const match = matchPage(url.pathname);
	if (match.page !== 'branch' || !match.branch) return fail(404, { deleteError: 'Not found.' });

	const formData = await request.formData();
	const kind = formData.get('kind')?.toString() as RouteDeleteKind | undefined;
	const routeDirPath = normalizeRepoPath(formData.get('routeDirPath')?.toString() ?? '');
	const filePath = normalizeRepoPath(formData.get('filePath')?.toString() ?? '');

	if (kind !== 'page' && kind !== 'route') {
		return fail(400, { deleteError: 'Invalid delete target.' });
	}
	if (!routeDirPath) {
		return fail(400, { deleteError: 'Route path is required.' });
	}

	const routesRoot = normalizeRepoPath(getConfig().routesRoot);
	if (!isWithinRepoRoot(routeDirPath, routesRoot)) {
		return fail(403, { deleteError: 'Access denied.' });
	}
	if (kind === 'route' && routeDirPath === routesRoot) {
		return fail(403, { deleteError: 'The routes root cannot be deleted.' });
	}
	if (kind === 'page' && (!filePath || !isWithinRepoRoot(filePath, routesRoot))) {
		return fail(400, { deleteError: 'Page path is required.' });
	}

	let pathsToDelete: string[] = [];
	try {
		const { tree } = await getBranchRouteSnapshot(match.branch, routesRoot);
		pathsToDelete = collectRouteDeletePaths(kind, routeDirPath, filePath, tree, routesRoot);
	} catch (err: unknown) {
		const e = err as { response?: { status?: number; data?: { message?: string } } };
		return fail(e.response?.status ?? 500, {
			deleteError: e.response?.data?.message ?? 'Failed to resolve route files.'
		});
	}

	if (pathsToDelete.length === 0) {
		return fail(404, { deleteError: 'Nothing to delete.' });
	}

	const store = getContentStore();
	try {
		if (kind === 'route' && store.isLocal) {
			await store.deleteFile(routeDirPath);
		} else if (kind === 'page' && store.isLocal) {
			await store.deleteFile(filePath);
		} else {
			for (const path of pathsToDelete) {
				await store.deleteFile(path);
			}
		}
		invalidateBranchRouteCache(match.branch);
	} catch (err: unknown) {
		const e = err as { response?: { status?: number; data?: { message?: string } } };
		return fail(e.response?.status ?? 500, {
			deleteError: e.response?.data?.message ?? 'Delete failed.'
		});
	}

	return { deleteSuccess: true };
}

export async function deleteMediaAction({ request, locals, url }: RequestEvent) {
	if (!locals.user) throw redirect(302, '/admin/login');

	const match = matchPage(url.pathname);
	if (match.page !== 'media' || !match.branch) return fail(404, { deleteError: 'Not found.' });

	const formData = await request.formData();
	const itemPath = normalizeRepoPath(formData.get('itemPath')?.toString() ?? '');
	const isDir = formData.get('isDir')?.toString() === 'true';

	const mediaDir = normalizeRepoPath(getConfig().mediaDir) ?? '';
	if (!itemPath) {
		return fail(400, { deleteError: 'Item path is required.' });
	}
	if (mediaDir && !isWithinRepoRoot(itemPath, mediaDir)) {
		return fail(403, { deleteError: 'Access denied.' });
	}

	const store = getContentStore();
	try {
		await store.deleteFile(itemPath);
	} catch (err: any) {
		const e = err as { response?: { status?: number; data?: { message?: string } } };
		return fail(e.response?.status ?? 500, {
			deleteError: e.response?.data?.message ?? 'Delete failed.'
		});
	}

	return { deleteSuccess: true };
}