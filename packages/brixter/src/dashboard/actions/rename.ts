import { fail, redirect, type RequestEvent } from '@sveltejs/kit';
import { getConfig } from '../../server/config.ts';
import { getContentStore } from '../../server/content-store.ts';
import { childDirNames, childPageNames, isWithinRepoRoot, normalizeRepoPath, routeDirUrlPath } from '../../server/sveltekit-routes.ts';
import { getBranchRouteSnapshot, invalidateBranchRouteCache } from '../repo-cache.ts';
import { matchPage, routesHref, validateDirectoryName } from '../shared.ts';

export async function renameRouteAction({ request, locals, url }: RequestEvent) {
	if (!locals.user) throw redirect(302, '/admin/login');

	const match = matchPage(url.pathname);
	if (match.page !== 'branch' || !match.branch) return fail(404, { renameError: 'Not found.' });

	const formData = await request.formData();
	const routeDirPath = normalizeRepoPath(formData.get('routeDirPath')?.toString() ?? '');
	const newName = formData.get('new_name')?.toString().trim() ?? '';

	const validationError = validateDirectoryName(newName);
	if (validationError) return fail(400, { renameError: validationError, newName });

	if (!routeDirPath) {
		return fail(400, { renameError: 'Route path is required.' });
	}

	const routesRoot = normalizeRepoPath(getConfig().routesRoot);
	if (!isWithinRepoRoot(routeDirPath, routesRoot)) {
		return fail(403, { renameError: 'Access denied.' });
	}
	if (routeDirPath === routesRoot) {
		return fail(403, { renameError: 'The routes root cannot be renamed.' });
	}

	const oldSegment = routeDirPath.split('/').pop() ?? '';
	if (oldSegment.toLowerCase() === newName.toLowerCase()) {
		return fail(400, { renameError: 'Name is unchanged.', newName });
	}

	const parentDir = routeDirPath.slice(0, routeDirPath.lastIndexOf('/'));
	const newRouteDirPath = `${parentDir}/${newName}`;
	if (!isWithinRepoRoot(newRouteDirPath, routesRoot)) {
		return fail(403, { renameError: 'Access denied.', newName });
	}

	try {
		const { routeTree } = await getBranchRouteSnapshot(match.branch, routesRoot);
		const siblingDirs = childDirNames(routeTree, parentDir);
		const siblingPages = childPageNames(routeTree, parentDir);
		const taken = new Set(
			[...siblingDirs, ...siblingPages]
				.filter((name) => name.toLowerCase() !== oldSegment.toLowerCase())
				.map((name) => name.toLowerCase())
		);
		if (taken.has(newName.toLowerCase())) {
			return fail(409, {
				renameError: `A route named "${newName}" already exists.`,
				newName
			});
		}
	} catch (err: unknown) {
		const e = err as { response?: { status?: number; data?: { message?: string } } };
		return fail(e.response?.status ?? 500, {
			renameError: e.response?.data?.message ?? 'Failed to check route name.',
			newName
		});
	}

	const store = getContentStore();

	if (store.isLocal) {
		try {
			const fs = await import('node:fs/promises');
			const pathLib = await import('node:path');

			let root = process.cwd();
			while (true) {
				const gitPath = pathLib.resolve(root, '.git');
				const hasGit = await fs.access(gitPath).then(() => true).catch(() => false);
				if (hasGit) break;
				const parent = pathLib.dirname(root);
				if (parent === root) break;
				root = parent;
			}

			const oldPath = pathLib.resolve(root, routeDirPath);
			const newPath = pathLib.resolve(root, newRouteDirPath);
			await fs.rename(oldPath, newPath);
			invalidateBranchRouteCache(match.branch);
		} catch (err: unknown) {
			const e = err as { response?: { status?: number; data?: { message?: string } } };
			return fail(e.response?.status ?? 500, {
				renameError: e.response?.data?.message ?? 'Rename failed.',
				newName
			});
		}
	} else {
		const { getOctokit, getRepo } = await import('../../server/github.ts');
		const octokit = getOctokit();
		const repo = getRepo();

		let treeItems: Array<{ path?: string; type?: string; sha?: string }>;
		try {
			const { data: tree } = await octokit.request('GET /repos/{owner}/{repo}/git/trees/{tree_sha}', {
				owner: repo.owner,
				repo: repo.name,
				tree_sha: match.branch,
				recursive: '1'
			});
			treeItems = tree.tree ?? [];
		} catch (err: unknown) {
			const e = err as { status?: number; response?: { status?: number } };
			const status = e.status ?? e.response?.status;
			if (status !== 404 && status !== 422) throw err;

			const { data: ref } = await octokit.request('GET /repos/{owner}/{repo}/git/ref/{ref}', {
				owner: repo.owner,
				repo: repo.name,
				ref: `heads/${match.branch}`
			});
			const { data: commit } = await octokit.request(
				'GET /repos/{owner}/{repo}/git/commits/{commit_sha}',
				{ owner: repo.owner, repo: repo.name, commit_sha: ref.object.sha }
			);
			const { data: tree } = await octokit.request('GET /repos/{owner}/{repo}/git/trees/{tree_sha}', {
				owner: repo.owner,
				repo: repo.name,
				tree_sha: commit.tree.sha,
				recursive: '1'
			});
			treeItems = tree.tree ?? [];
		}

		const blobs = treeItems
			.filter((item) => item.type === 'blob' && item.path && item.sha)
			.map((item) => ({ path: item.path as string, sha: item.sha as string }));

		const prefix = `${routeDirPath}/`;
		const blobsToMove = blobs.filter((blob) => blob.path.startsWith(prefix));

		if (blobsToMove.length === 0) {
			return fail(404, { renameError: 'Nothing to rename.', newName });
		}

		const treeItems2 = [
			...blobsToMove.map(({ path, sha }) => ({
				path: path.replace(prefix, `${newRouteDirPath}/`),
				mode: '100644' as const,
				type: 'blob' as const,
				sha
			})),
			...blobsToMove.map(({ path }) => ({
				path,
				mode: '100644' as const,
				type: 'blob' as const,
				sha: null
			}))
		];

		if (treeItems2.length > 0) {
			const { data: ref } = await octokit.request('GET /repos/{owner}/{repo}/git/ref/{ref}', {
				owner: repo.owner,
				repo: repo.name,
				ref: `heads/${match.branch}`
			});
			const commitSha = ref.object.sha;

			const { data: commit } = await octokit.request(
				'GET /repos/{owner}/{repo}/git/commits/{commit_sha}',
				{ owner: repo.owner, repo: repo.name, commit_sha: commitSha }
			);

			const { data: newTree } = await octokit.request('POST /repos/{owner}/{repo}/git/trees', {
				owner: repo.owner,
				repo: repo.name,
				base_tree: commit.tree.sha,
				tree: treeItems2
			});

			const label = routeDirPath.split('/').pop() ?? routeDirPath;
			const { data: newCommit } = await octokit.request('POST /repos/{owner}/{repo}/git/commits', {
				owner: repo.owner,
				repo: repo.name,
				message: `Rename ${label}`,
				tree: newTree.sha,
				parents: [commitSha]
			});

			await octokit.request('PATCH /repos/{owner}/{repo}/git/refs/{ref}', {
				owner: repo.owner,
				repo: repo.name,
				ref: `heads/${match.branch}`,
				sha: newCommit.sha
			});
		}

		invalidateBranchRouteCache(match.branch);
	}

	throw redirect(303, routesHref(routeDirUrlPath(routesRoot, newRouteDirPath)));
}