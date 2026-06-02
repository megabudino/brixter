import { json, type RequestEvent } from '@sveltejs/kit';
import { getOctokit, getRepo } from '../server/github.ts';
import { getRepoConfig } from '../server/repo-config.ts';
import { getConfig } from '../server/config.ts';
import { isWithinRepoRoot, normalizeRepoPath } from '../server/sveltekit-routes.ts';

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'];

async function resolveLocalPath(repoRelativePath: string): Promise<string> {
	const fs = await import('node:fs/promises');
	const pathLib = await import('node:path');
	
	let root = process.cwd();
	while (true) {
		const gitPath = pathLib.join(root, '.git');
		const hasGit = await fs.access(gitPath).then(() => true).catch(() => false);
		if (hasGit) {
			return pathLib.resolve(root, repoRelativePath);
		}
		const parent = pathLib.dirname(root);
		if (parent === root) {
			break;
		}
		root = parent;
	}
	
	let resolved = pathLib.resolve(process.cwd(), repoRelativePath);
	const cwdNormalized = process.cwd().replace(/\\/g, '/');
	if (cwdNormalized.endsWith('/site') && repoRelativePath.startsWith('site/')) {
		resolved = pathLib.resolve(pathLib.dirname(process.cwd()), repoRelativePath);
	}
	return resolved;
}

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

	if (request.method === 'POST') {
		try {
			const formData = await request.formData();
			const branch = formData.get('branch')?.toString();
			const path = normalizeRepoPath(formData.get('path')?.toString() ?? '');
			const action = formData.get('action')?.toString();

			if (!branch || !action) {
				return json({ error: 'Missing required parameters' }, { status: 400 });
			}

			const { mediaDir } = getConfig();
			const mediaRoot = normalizeRepoPath(mediaDir);

			const octokit = getOctokit();
			const repo = getRepo();

			if (action === 'create-dir') {
				const name = formData.get('name')?.toString().trim();
				if (!name) return json({ error: 'Directory name is required' }, { status: 400 });
				if (name.includes('/') || name.includes('\\') || name === '.' || name === '..') {
					return json({ error: 'Invalid directory name' }, { status: 400 });
				}

				const targetPath = normalizeRepoPath(path ? `${path}/${name}/.gitkeep` : `${name}/.gitkeep`);
				if (mediaRoot && !isWithinRepoRoot(targetPath, mediaRoot)) {
					return json({ error: 'Access denied' }, { status: 403 });
				}

				await octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', {
					owner: repo.owner,
					repo: repo.name,
					path: targetPath,
					message: `Create directory ${name}`,
					content: Buffer.from('').toString('base64'),
					branch
				});

				if (process.env.NODE_ENV !== 'production') {
					try {
						const fs = await import('node:fs/promises');
						const pathLib = await import('node:path');
						const localPath = await resolveLocalPath(targetPath);
						await fs.mkdir(pathLib.dirname(localPath), { recursive: true });
						await fs.writeFile(localPath, '');
					} catch (fsErr) {
						console.error('Failed to create local directory:', fsErr);
					}
				}

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
				const base64Content = Buffer.from(arrayBuffer).toString('base64');

				await octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', {
					owner: repo.owner,
					repo: repo.name,
					path: targetPath,
					message: `Upload ${fileName}`,
					content: base64Content,
					branch
				});

				if (process.env.NODE_ENV !== 'production') {
					try {
						const fs = await import('node:fs/promises');
						const pathLib = await import('node:path');
						const localPath = await resolveLocalPath(targetPath);
						await fs.mkdir(pathLib.dirname(localPath), { recursive: true });
						await fs.writeFile(localPath, Buffer.from(arrayBuffer));
					} catch (fsErr) {
						console.error('Failed to write uploaded file locally:', fsErr);
					}
				}

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

	const branch = url.searchParams.get('branch');
	const { mediaDir } = getConfig();
	const mediaRoot = normalizeRepoPath(mediaDir);
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

	if (process.env.NODE_ENV !== 'production') {
		try {
			const fs = await import('node:fs/promises');
			const localFilePath = await resolveLocalPath(path);
			const exists = await fs.access(localFilePath).then(() => true).catch(() => false);
			if (exists) {
				const content = await fs.readFile(localFilePath);
				const contentType = path.endsWith('.svg')
					? 'image/svg+xml'
					: path.endsWith('.webp')
						? 'image/webp'
						: path.endsWith('.png')
							? 'image/png'
							: path.endsWith('.gif')
								? 'image/gif'
								: 'image/jpeg';
				return new Response(content, {
					headers: {
						'Content-Type': contentType,
						'Cache-Control': 'private, max-age=3600'
					}
				});
			}
		} catch (err) {
			console.error('Failed to read local file for repoImage:', err);
		}
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

	if (process.env.NODE_ENV !== 'production') {
		try {
			const fs = await import('node:fs/promises');
			const localDir = await resolveLocalPath(targetPath);

			const exists = await fs.access(localDir).then(() => true).catch(() => false);
			if (exists) {
				const dirents = await fs.readdir(localDir, { withFileTypes: true });
				const entries = dirents
					.map((item) => {
						const itemPath = relativePath ? `${relativePath}/${item.name}` : item.name;
						const fullRepoPath = `${targetPath}/${item.name}`;
						return {
							name: item.name,
							path: itemPath,
							type: item.isDirectory() ? 'dir' : 'file',
							downloadUrl: item.isDirectory()
								? null
								: `/admin/api/repo-image?branch=${branch}&path=${fullRepoPath}`
						};
					})
					.filter((item) => {
						if (item.type === 'dir') return true;
						return item.name.toLowerCase().endsWith('.svg');
					})
					.sort((a, b) => {
						if (a.type === b.type) return a.name.localeCompare(b.name);
						return a.type === 'dir' ? -1 : 1;
					});

				return json({ path: targetPath, entries });
			}
		} catch (err) {
			console.error('Failed to read local icons directory:', err);
		}
	}

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
