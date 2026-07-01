import { fail, redirect, type RequestEvent } from '@sveltejs/kit';
import { getConfig } from '../../server/config.ts';
import { getContentStore } from '../../server/content-store.ts';
import {
	childDirNames,
	childPageNames,
	findRouteNode,
	resolveRouteUrlPath,
	isWithinRepoRoot,
	normalizeRepoPath,
	routeDirUrlPath,
	type RouteNode
} from '../../server/sveltekit-routes.ts';
import { getBranchRouteSnapshot, invalidateBranchRouteCache } from '../repo-cache.ts';
import { matchPage, routesHref, validateDirectoryName } from '../shared.ts';
import { Buffer } from 'node:buffer';

export async function createDirectoryAction({ request, locals, url }: RequestEvent) {
	if (!locals.user) throw redirect(302, '/admin/login');

	const match = matchPage(url.pathname);
	if (match.page !== 'branch' || !match.branch)
		return fail(404, { createDirectoryError: 'Not found.' });

	const formData = await request.formData();
	const name = formData.get('directory_name')?.toString().trim() ?? '';
	const validationError = validateDirectoryName(name);
	if (validationError)
		return fail(400, { createDirectoryError: validationError, directoryName: name });

	const routesRoot = normalizeRepoPath(getConfig().routesRoot);
	let routeTree: RouteNode;
	try {
		({ routeTree } = await getBranchRouteSnapshot(match.branch, routesRoot));
	} catch (err: unknown) {
		const e = err as { response?: { status?: number; data?: { message?: string } } };
		return fail(e.response?.status ?? 500, {
			createDirectoryError: e.response?.data?.message ?? 'Failed to check directory.',
			directoryName: name
		});
	}

	let routeRequest: ReturnType<typeof resolveRouteUrlPath>;
	try {
		routeRequest = resolveRouteUrlPath(routeTree, match.path ?? '');
	} catch {
		return fail(404, { createDirectoryError: 'Not found.', directoryName: name });
	}

	const currentPath = routeRequest.dirPath;
	if (!isWithinRepoRoot(currentPath, routesRoot)) {
		return fail(403, { createDirectoryError: 'Access denied.', directoryName: name });
	}

	const directoryPath = `${currentPath}/${name}`;
	if (!isWithinRepoRoot(directoryPath, routesRoot)) {
		return fail(403, { createDirectoryError: 'Access denied.', directoryName: name });
	}

	const store = getContentStore();
	if (store.isLocal) {
		const existing = await store.listDirectory(directoryPath);
		const routeNode = findRouteNode(routeTree, directoryPath);
		if (existing.length > 0 || routeNode) {
			throw redirect(303, routesHref(routeDirUrlPath(routesRoot, directoryPath)));
		}
	} else {
		const { getOctokit, getRepo } = await import('../../server/github.ts');
		const octokit = getOctokit();
		const repo = getRepo();

		let directoryAlreadyExists = false;

		try {
			const { data } = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
				owner: repo.owner,
				repo: repo.name,
				path: directoryPath,
				ref: match.branch
			});

			if (Array.isArray(data)) {
				directoryAlreadyExists = true;
			} else {
				return fail(409, {
					createDirectoryError: `A file named "${name}" already exists.`,
					directoryName: name
				});
			}
		} catch (err: unknown) {
			const e = err as { response?: { status?: number; data?: { message?: string } } };
			if (e.response?.status !== 404) {
				return fail(e.response?.status ?? 500, {
					createDirectoryError: e.response?.data?.message ?? 'Failed to check directory.',
					directoryName: name
				});
			}
		}

		if (directoryAlreadyExists) {
			throw redirect(303, routesHref(routeDirUrlPath(routesRoot, directoryPath)));
		}

		try {
			await octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', {
				owner: repo.owner,
				repo: repo.name,
				path: `${directoryPath}/.gitkeep`,
				message: `Create ${directoryPath}`,
				content: Buffer.from('').toString('base64'),
				branch: match.branch
			});
			invalidateBranchRouteCache(match.branch);
		} catch (err: unknown) {
			const e = err as { response?: { status?: number; data?: { message?: string } } };
			return fail(e.response?.status ?? 500, {
				createDirectoryError: e.response?.data?.message ?? 'Failed to create directory.',
				directoryName: name
			});
		}

		throw redirect(303, routesHref(routeDirUrlPath(routesRoot, directoryPath)));
	}

	try {
		await store.createDirectory(directoryPath);
		invalidateBranchRouteCache(match.branch);
	} catch (err: unknown) {
		const e = err as { response?: { status?: number; data?: { message?: string } } };
		return fail(e.response?.status ?? 500, {
			createDirectoryError: e.response?.data?.message ?? 'Failed to create directory.',
			directoryName: name
		});
	}

	throw redirect(303, routesHref(routeDirUrlPath(routesRoot, directoryPath)));
}