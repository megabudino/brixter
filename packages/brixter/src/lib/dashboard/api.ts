import { json, type RequestEvent } from '@sveltejs/kit';
import { getOctokit, getRepo } from '../server/github.ts';
import { getRepoConfig } from '../server/repo-config.ts';
import { isWithinRepoRoot, normalizeRepoPath } from '../server/sveltekit-routes.ts';

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'];

function apiPath(pathname: string): string {
	const marker = '/admin/api/';
	if (pathname.startsWith(marker)) return pathname.slice(marker.length);
	const hiddenMarker = '/__brixter/api/';
	if (pathname.startsWith(hiddenMarker)) return pathname.slice(hiddenMarker.length);
	return '';
}

async function mediaPicker({ locals, url }: RequestEvent) {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	const branch = url.searchParams.get('branch');
	const { mediaPath } = getRepoConfig();
	const mediaRoot = normalizeRepoPath(mediaPath);
	const path = normalizeRepoPath(url.searchParams.get('path') ?? mediaRoot);
	if (!branch) return json({ error: 'Missing required parameters' }, { status: 400 });

	if (mediaRoot && !isWithinRepoRoot(path, mediaRoot)) {
		return json({ error: 'Access denied' }, { status: 403 });
	}

	const octokit = getOctokit();
	const repo = getRepo();

	try {
		const { data } = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
			owner: repo.owner,
			repo: repo.name,
			path,
			ref: branch
		});

		if (!Array.isArray(data)) return json({ error: 'Path is not a directory' }, { status: 400 });

		const entries = data
			.map((item) => ({
				name: item.name,
				path: item.path,
				type: item.type as 'file' | 'dir',
				downloadUrl: item.download_url as string | null
			}))
			.filter((item) => {
				if (item.type === 'dir') {
					return !mediaRoot || isWithinRepoRoot(item.path, mediaRoot);
				}

				const ext = '.' + item.name.split('.').pop()?.toLowerCase();
				if (!IMAGE_EXTENSIONS.includes(ext)) return false;
				return !mediaRoot || isWithinRepoRoot(item.path, mediaRoot);
			})
			.sort((a, b) => {
				if (a.type === b.type) return a.name.localeCompare(b.name);
				return a.type === 'dir' ? -1 : 1;
			});

		return json({ path, entries });
	} catch (err: unknown) {
		const e = err as { response?: { status?: number; data?: { message?: string } } };
		return json(
			{ error: e.response?.data?.message ?? 'Failed to load contents' },
			{ status: e.response?.status ?? 500 }
		);
	}
}

async function repoImage({ locals, url }: RequestEvent) {
	if (!locals.user) return new Response('Unauthorized', { status: 401 });

	const branch = url.searchParams.get('branch');
	const path = url.searchParams.get('path');
	if (!branch || !path) return new Response('Missing parameters', { status: 400 });

	const octokit = getOctokit();
	const repo = getRepo();

	try {
		const { data } = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
			owner: repo.owner,
			repo: repo.name,
			path,
			ref: branch
		});

		const file = data as { content?: string; encoding?: string };
		if (!file.content || file.encoding !== 'base64') {
			return new Response('Not a file', { status: 400 });
		}

		const contentType = path.endsWith('.svg')
			? 'image/svg+xml'
			: path.endsWith('.webp')
				? 'image/webp'
				: path.endsWith('.png')
					? 'image/png'
					: path.endsWith('.gif')
						? 'image/gif'
						: 'image/jpeg';

		return new Response(Buffer.from(file.content, 'base64'), {
			headers: {
				'Content-Type': contentType,
				'Cache-Control': 'private, max-age=3600'
			}
		});
	} catch (err: unknown) {
		const e = err as { response?: { status?: number } };
		return new Response('Image not found', { status: e.response?.status ?? 404 });
	}
}

export async function handleDashboardApi(event: RequestEvent) {
	if (event.url.pathname.startsWith('/__brixter'))
		return new Response('Not found', { status: 404 });

	switch (apiPath(event.url.pathname)) {
		case 'media-picker':
			return mediaPicker(event);
		case 'repo-image':
			return repoImage(event);
		default:
			return new Response('Not found', { status: 404 });
	}
}
