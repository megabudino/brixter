import { json, type RequestEvent } from '@sveltejs/kit';
import { getContentStore, isLocalMode, type ContentEntry } from '../server/content-store.ts';
import { getConfig } from '../server/config.ts';
import { isWithinRepoRoot, normalizeRepoPath } from '../server/sveltekit-routes.ts';
import { Buffer } from 'node:buffer';

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'];

function apiPath(pathname: string): string {
	const marker = '/admin/api/';
	if (pathname.startsWith(marker)) return pathname.slice(marker.length);
	const hiddenMarker = '/__brixter/api/';
	if (pathname.startsWith(hiddenMarker)) return pathname.slice(hiddenMarker.length);
	return '';
}

async function mediaPicker(event: RequestEvent) {
	const { locals, url, request } = event;
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	const store = getContentStore();
	const branch = store.branch;

	if (request.method === 'POST') {
		try {
			const formData = await request.formData();
			const path = normalizeRepoPath(formData.get('path')?.toString() ?? '');
			const action = formData.get('action')?.toString();

			if (!branch || !action) {
				return json({ error: 'Missing required parameters' }, { status: 400 });
			}

			const { mediaDir } = getConfig();
			const mediaRoot = normalizeRepoPath(mediaDir);

			if (action === 'create-dir') {
				const name = formData.get('name')?.toString().trim();
				if (!name) return json({ error: 'Directory name is required' }, { status: 400 });
				if (name.includes('/') || name.includes('\\') || name === '.' || name === '..') {
					return json({ error: 'Invalid directory name' }, { status: 400 });
				}

				const targetPath = normalizeRepoPath(path ? `${path}/${name}` : `${name}`);
				if (mediaRoot && !isWithinRepoRoot(targetPath, mediaRoot)) {
					return json({ error: 'Access denied' }, { status: 403 });
				}

				await store.createDirectory(targetPath);
				return json({ success: true });
			} else if (action === 'upload') {
				const file = formData.get('file');
				if (!file || typeof (file as any).arrayBuffer !== 'function') {
					return json({ error: 'No file provided' }, { status: 400 });
				}

				const fileName = (file as any).name;
				const targetPath = normalizeRepoPath(path ? `${path}/${fileName}` : fileName);
				if (mediaRoot && !isWithinRepoRoot(targetPath, mediaRoot)) {
					return json({ error: 'Access denied' }, { status: 403 });
				}

				const arrayBuffer = await (file as any).arrayBuffer();
				await store.writeFile(targetPath, Buffer.from(arrayBuffer));

				return json({ success: true });
			} else if (action === 'delete') {
				const itemPath = normalizeRepoPath(formData.get('itemPath')?.toString() ?? '');
				const isDir = formData.get('isDir')?.toString() === 'true';

				if (!itemPath) {
					return json({ error: 'Item path is required' }, { status: 400 });
				}
				if (mediaRoot && !isWithinRepoRoot(itemPath, mediaRoot)) {
					return json({ error: 'Access denied' }, { status: 403 });
				}

				await store.deleteFile(itemPath);

				return json({ success: true });
			} else {
				return json({ error: 'Invalid action' }, { status: 400 });
			}
		} catch (err: any) {
			const e = err as { response?: { status?: number; data?: { message?: string } } };
			return json(
				{ error: e.response?.data?.message ?? err.message ?? 'Operation failed' },
				{ status: e.response?.status ?? 500 }
			);
		}
	}

	// GET: list directory
	const { mediaDir } = getConfig();
	const mediaRoot = normalizeRepoPath(mediaDir);
	const queryPath = normalizeRepoPath(url.searchParams.get('path') ?? mediaRoot);
	const all = url.searchParams.get('all') === 'true';
	if (!branch) return json({ error: 'Missing required parameters' }, { status: 400 });

	if (mediaRoot && !isWithinRepoRoot(queryPath, mediaRoot)) {
		return json({ error: 'Access denied' }, { status: 403 });
	}

	try {
		const entries = await store.listDirectory(queryPath);

		const filtered = entries
			.filter((item: ContentEntry) => {
				if (item.name === '.gitkeep') return false;
				if (item.type === 'dir') {
					return !mediaRoot || isWithinRepoRoot(item.path, mediaRoot);
				}

				if (!all) {
					const ext = '.' + item.name.split('.').pop()?.toLowerCase();
					if (!IMAGE_EXTENSIONS.includes(ext)) return false;
				}
				return !mediaRoot || isWithinRepoRoot(item.path, mediaRoot);
			})
			.sort((a: ContentEntry, b: ContentEntry) => {
				if (a.type === b.type) return (a.name ?? '').localeCompare(b.name ?? '');
				return a.type === 'dir' ? -1 : 1;
			});

		return json({ path: queryPath, entries: filtered });
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

	// In local mode, serve directly from the filesystem
	if (isLocalMode()) {
		const store = getContentStore();
		try {
			const buffer = await store.readBuffer(path);
			const contentType = path.endsWith('.svg')
				? 'image/svg+xml'
				: path.endsWith('.webp')
					? 'image/webp'
					: path.endsWith('.png')
						? 'image/png'
						: path.endsWith('.gif')
							? 'image/gif'
							: 'image/jpeg';

			return new Response(new Uint8Array(buffer), {
				headers: {
					'Content-Type': contentType,
					'Cache-Control': 'private, max-age=3600'
				}
			});
		} catch {
			return new Response('Image not found', { status: 404 });
		}
	}

	// GitHub mode
	const { getOctokit, getRepo } = await import('../server/github.ts');
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

async function iconPicker(event: RequestEvent) {
	const { locals, url } = event;
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	const branch = url.searchParams.get('branch');
	if (!branch) return json({ error: 'Missing required parameters' }, { status: 400 });

	const { appRoot } = getConfig();
	const iconsBase = [appRoot, 'src/lib/brixter/icons'].filter(Boolean).join('/');
	const relativePath = url.searchParams.get('path') ?? '';
	const targetPath = relativePath ? `${iconsBase}/${relativePath}` : iconsBase;

	// In local mode, read direct from filesystem
	if (isLocalMode()) {
		const store = getContentStore();
		try {
			const entries = await store.listDirectory(targetPath);
			const filtered = entries
				.filter((item: ContentEntry) => {
					if (item.type === 'dir') return true;
					return item.name.toLowerCase().endsWith('.svg');
				})
				.sort((a: ContentEntry, b: ContentEntry) => {
					if (a.type === b.type) return (a.name ?? '').localeCompare(b.name ?? '');
					return a.type === 'dir' ? -1 : 1;
				});

			return json({ path: targetPath, entries: filtered });
		} catch {
			return json({ path: targetPath, entries: [] });
		}
	}

	// GitHub mode
	const { getOctokit, getRepo } = await import('../server/github.ts');
	const octokit = getOctokit();
	const repo = getRepo();

	try {
		const { data } = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
			owner: repo.owner,
			repo: repo.name,
			path: targetPath,
			ref: branch
		});

		if (!Array.isArray(data)) return json({ error: 'Path is not a directory' }, { status: 400 });

		const entries = data
			.map((item) => ({
				name: item.name,
				path: relativePath ? `${relativePath}/${item.name}` : item.name,
				type: item.type as 'file' | 'dir',
				downloadUrl: item.type === 'dir'
					? null
					: `/admin/api/repo-image?branch=${branch}&path=${item.path}`
			}))
			.filter((item) => {
				if (item.type === 'dir') return true;
				return item.name.toLowerCase().endsWith('.svg');
			})
			.sort((a, b) => {
				if (a.type === b.type) return a.name.localeCompare(b.name);
				return a.type === 'dir' ? -1 : 1;
			});

		return json({ path: targetPath, entries });
	} catch (err: unknown) {
		const e = err as { response?: { status?: number; data?: { message?: string } } };
		if (e.response?.status === 404) {
			return json({ path: targetPath, entries: [] });
		}
		return json(
			{ error: e.response?.data?.message ?? 'Failed to load icons' },
			{ status: e.response?.status ?? 500 }
		);
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
		case 'icon-picker':
			return iconPicker(event);
		default:
			return new Response('Not found', { status: 404 });
	}
}