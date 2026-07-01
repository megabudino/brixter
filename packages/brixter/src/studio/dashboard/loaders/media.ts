import { error, redirect, type RequestEvent } from '@sveltejs/kit';
import { getConfig } from '../../server/config.ts';
import { getContentStore, isLocalMode } from '../../server/content-store.ts';
import { isWithinRepoRoot, normalizeRepoPath } from '../../server/sveltekit-routes.ts';
import { defaultBranchForConfig, ensureDraftBranch, repoMeta, type PageMatch } from '../shared.ts';

export async function loadMedia({ locals }: RequestEvent, match: PageMatch) {
	if (!locals.user) throw redirect(302, '/admin/login');

	const mediaDir = normalizeRepoPath(getConfig().mediaDir) ?? '';
	const defaultBranch = defaultBranchForConfig();
	await ensureDraftBranch();

	const branch = getContentStore().branch;
	const currentPath = normalizeRepoPath(match.path ? `${mediaDir}/${match.path}` : mediaDir);

	if (mediaDir && !isWithinRepoRoot(currentPath, mediaDir)) {
		throw error(403, 'Access denied');
	}

	const store = getContentStore();
	let entries: any[] = [];
	let loadError = '';

	try {
		const dirEntries = await store.listDirectory(currentPath);

		if (dirEntries.length > 0) {
			entries = dirEntries
				.filter((item) => {
					if (item.name === '.gitkeep') return false;
					if (item.type === 'dir') {
						return !mediaDir || isWithinRepoRoot(item.path, mediaDir);
					}
					return !mediaDir || isWithinRepoRoot(item.path, mediaDir);
				})
				.sort((a, b) => {
					if (a.type === b.type) return a.name.localeCompare(b.name);
					return a.type === 'dir' ? -1 : 1;
				});
		} else if (!isLocalMode()) {
			const { getOctokit, getRepo } = await import('../../server/github.ts');
			const octokit = getOctokit();
			const repo = getRepo();

			try {
				const { data } = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
					owner: repo.owner,
					repo: repo.name,
					path: currentPath,
					ref: branch
				});

				if (Array.isArray(data)) {
					entries = data
						.map((item) => ({
							name: item.name,
							path: item.path,
							type: item.type as 'file' | 'dir',
							downloadUrl: item.download_url as string | null,
							sha: item.sha
						}))
						.filter((item) => {
							if (item.name === '.gitkeep') return false;
							if (item.type === 'dir') {
								return !mediaDir || isWithinRepoRoot(item.path, mediaDir);
							}
							return !mediaDir || isWithinRepoRoot(item.path, mediaDir);
						})
						.sort((a, b) => {
							if (a.type === b.type) return a.name.localeCompare(b.name);
							return a.type === 'dir' ? -1 : 1;
						});
				}
			} catch (err: any) {
				const e = err as { response?: { status?: number; data?: { message?: string } } };
				if (e.response?.status !== 404) {
					loadError = e.response?.data?.message ?? 'Failed to load media files.';
				}
			}
		}
	} catch (err: any) {
		const e = err as { response?: { status?: number; data?: { message?: string } } };
		if (e.response?.status !== 404) {
			loadError = e.response?.data?.message ?? 'Failed to load media files.';
		}
	}

	const relativeSegments = match.path ? match.path.split('/').filter(Boolean) : [];
	const breadcrumbs = [
		{ label: 'Media', path: '' },
		...relativeSegments.map((segment, index) => {
			const subPath = relativeSegments.slice(0, index + 1).join('/');
			return {
				label: segment,
				path: subPath
			};
		})
	];

	const rm = repoMeta();
	return {
		repo: { name: rm.name, fullName: rm.fullName, mediaPath: mediaDir },
		branch,
		defaultBranch,
		currentPath,
		relativePath: match.path ?? '',
		entries,
		breadcrumbs,
		loadError
	};
}