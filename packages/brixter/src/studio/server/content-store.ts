import { readFileSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync, rmSync, unlinkSync, renameSync } from 'node:fs';
import { readFile, writeFile, mkdir, readdir, rm, unlink, rename, access, stat } from 'node:fs/promises';
import { resolve, dirname, relative } from 'node:path';
import { Buffer } from 'node:buffer';
import { getOctokit, getRepo } from './github.ts';
import { getConfig } from './config.ts';
import type { TreeEntry } from './sveltekit-routes.ts';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ContentEntry {
	name: string;
	path: string;
	type: 'file' | 'dir';
	sha?: string;
	downloadUrl?: string | null;
}

export interface ReadFileResult {
	content: string;
	sha: string;
	size: number;
	downloadUrl?: string;
}

export interface BranchStatus {
	behindBy: number;
	aheadBy: number;
}

export interface SyncResult {
	behindBy: number;
	aheadBy: number;
	syncError?: string;
}

// ---------------------------------------------------------------------------
// ContentStore interface
// ---------------------------------------------------------------------------

export interface ContentStore {
	/** Read a file as UTF-8 and return content + metadata. */
	readFile(path: string): Promise<ReadFileResult>;

	/** Read a file as a raw Buffer (for binary files like images). */
	readBuffer(path: string): Promise<Buffer>;

	/** Write file content. Returns the new SHA (or empty string for local mode). */
	writeFile(path: string, content: string | Buffer, sha?: string): Promise<{ sha: string }>;

	/** Delete a file. sha is optional in local mode. */
	deleteFile(path: string, sha?: string): Promise<void>;

	/** List contents of a directory. */
	listDirectory(path: string): Promise<ContentEntry[]>;

	/** Create a directory (by writing a .gitkeep or mkdir). */
	createDirectory(path: string): Promise<void>;

	/** Get full recursive tree of all blobs and trees under a root path. */
	getTree(rootPath: string): Promise<TreeEntry[]>;

	/** Get branch comparison status (no-op for local, returns zeros). */
	getStatus(): Promise<BranchStatus>;

	/** Ensure the draft branch exists (no-op for local). */
	ensureDraftBranch(): Promise<void>;

	/** Sync draft with default branch (no-op for local). */
	syncWithDefault(): Promise<SyncResult>;

	/** Merge default branch into draft (no-op for local). */
	mergeDefaultIntoDraft(): Promise<void>;

	/** Publish changes (no-op in local, returns success). */
	publish(): Promise<{ success: boolean; error?: string }>;

	/** Invalidate any caches for this "branch". */
	invalidateCache(): void;

	/** The "branch" name used for operations. */
	readonly branch: string;

	/** Whether this is local mode. */
	readonly isLocal: boolean;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function shaFromContent(content: string): string {
	// Simple SHA-like hash based on content + length for local mode.
	// This is not cryptographic — it only needs to be unique enough for
	// the dashboard to detect stale saves.
	let hash = 0;
	for (let i = 0; i < content.length; i++) {
		const char = content.charCodeAt(i);
		hash = ((hash << 5) - hash) + char;
		hash |= 0;
	}
	return `local-${Math.abs(hash).toString(16)}-${content.length}`;
}

function isGithubNotFound(err: unknown): boolean {
	const e = err as { status?: number; response?: { status?: number } };
	return (e.status ?? e.response?.status) === 404;
}

// ---------------------------------------------------------------------------
// GitHubContentStore
// ---------------------------------------------------------------------------

class GitHubContentStore implements ContentStore {
	readonly branch = 'brixter-draft';
	readonly isLocal = false;
	private readonly _draftBranch = 'brixter-draft';

	async readFile(path: string): Promise<ReadFileResult> {
		const result = await this._rawFetch(path);
		return {
			content: Buffer.from(result.content, 'base64').toString('utf-8'),
			sha: result.sha,
			size: result.size,
			downloadUrl: result.downloadUrl
		};
	}

	async readBuffer(path: string): Promise<Buffer> {
		const result = await this._rawFetch(path);
		return Buffer.from(result.content, 'base64');
	}

	private async _rawFetch(path: string): Promise<{
		content: string;
		sha: string;
		size: number;
		downloadUrl: string;
	}> {
		const octokit = getOctokit();
		const repo = getRepo();

		const { data } = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
			owner: repo.owner,
			repo: repo.name,
			path,
			ref: this._draftBranch
		});

		const file = data as {
			name: string;
			path: string;
			sha: string;
			download_url: string;
			size: number;
			content?: string;
			encoding?: string;
		};

		return {
			content: (file.content && file.encoding === 'base64') ? file.content : '',
			sha: file.sha,
			size: file.size,
			downloadUrl: file.download_url
		};
	}

	async writeFile(
		path: string,
		content: string | Buffer,
		sha?: string
	): Promise<{ sha: string }> {
		const octokit = getOctokit();
		const repo = getRepo();
		const base64Content = Buffer.isBuffer(content)
			? content.toString('base64')
			: Buffer.from(content).toString('base64');

		const { data } = await octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', {
			owner: repo.owner,
			repo: repo.name,
			path,
			message: `Update ${path}`,
			content: base64Content,
			branch: this._draftBranch,
			sha
		});
		return { sha: (data as { content?: { sha?: string } }).content?.sha ?? '' };
	}

	async deleteFile(path: string, sha?: string): Promise<void> {
		const octokit = getOctokit();
		const repo = getRepo();

		let fileSha = sha;
		if (!fileSha) {
			try {
				const { data } = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
					owner: repo.owner,
					repo: repo.name,
					path,
					ref: this._draftBranch
				});
				if (!Array.isArray(data)) fileSha = (data as { sha?: string }).sha;
			} catch { /* ignore */ }
		}

		if (fileSha) {
			await octokit.request('DELETE /repos/{owner}/{repo}/contents/{path}', {
				owner: repo.owner,
				repo: repo.name,
				path,
				message: `Delete ${path.split('/').pop()}`,
				sha: fileSha,
				branch: this._draftBranch
			});
		}
	}

	async listDirectory(path: string): Promise<ContentEntry[]> {
		const octokit = getOctokit();
		const repo = getRepo();

		const { data } = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
			owner: repo.owner,
			repo: repo.name,
			path,
			ref: this._draftBranch
		});

		if (!Array.isArray(data)) return [];

		return data.map((item) => ({
			name: item.name,
			path: item.path,
			type: item.type as 'file' | 'dir',
			sha: item.sha,
			downloadUrl: item.download_url as string | null
		}));
	}

	async createDirectory(path: string): Promise<void> {
		const octokit = getOctokit();
		const repo = getRepo();
		const gitkeepPath = path.endsWith('/') ? `${path}.gitkeep` : `${path}/.gitkeep`;

		await octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', {
			owner: repo.owner,
			repo: repo.name,
			path: gitkeepPath,
			message: `Create ${path}`,
			content: Buffer.from('').toString('base64'),
			branch: this._draftBranch
		});
	}

	async getTree(_rootPath: string): Promise<TreeEntry[]> {
		const octokit = getOctokit();
		const repo = getRepo();

		try {
			const { data: tree } = await octokit.request('GET /repos/{owner}/{repo}/git/trees/{tree_sha}', {
				owner: repo.owner,
				repo: repo.name,
				tree_sha: this._draftBranch,
				recursive: '1'
			});
			return normalizeTreeEntries(tree.tree);
		} catch (err: unknown) {
			if (!isGithubNotFound(err) && (err as { status?: number }).status !== 422) throw err;
		}

		const { data: ref } = await octokit.request('GET /repos/{owner}/{repo}/git/ref/{ref}', {
			owner: repo.owner,
			repo: repo.name,
			ref: `heads/${this._draftBranch}`
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

		return normalizeTreeEntries(tree.tree);
	}

	async getStatus(): Promise<BranchStatus> {
		const repo = getRepo();
		if (repo.defaultBranch === this._draftBranch) return { behindBy: 0, aheadBy: 0 };

		const octokit = getOctokit();
		try {
			const { data: comparison } = await octokit.request(
				'GET /repos/{owner}/{repo}/compare/{basehead}',
				{
					owner: repo.owner,
					repo: repo.name,
					basehead: `${repo.defaultBranch}...${this._draftBranch}`
				}
			);
			return { aheadBy: comparison.ahead_by, behindBy: comparison.behind_by };
		} catch {
			return { behindBy: 0, aheadBy: 0 };
		}
	}

	async ensureDraftBranch(): Promise<void> {
		const octokit = getOctokit();
		const repo = getRepo();
		if (repo.defaultBranch === this._draftBranch) return;

		try {
			await octokit.request('GET /repos/{owner}/{repo}/git/ref/{ref}', {
				owner: repo.owner,
				repo: repo.name,
				ref: `heads/${this._draftBranch}`
			});
			return; // exists
		} catch (err: unknown) {
			if (!isGithubNotFound(err)) throw err;
		}

		const { data: ref } = await octokit.request('GET /repos/{owner}/{repo}/git/ref/{ref}', {
			owner: repo.owner,
			repo: repo.name,
			ref: `heads/${repo.defaultBranch}`
		});

		try {
			await octokit.request('POST /repos/{owner}/{repo}/git/refs', {
				owner: repo.owner,
				repo: repo.name,
				ref: `refs/heads/${this._draftBranch}`,
				sha: ref.object.sha
			});
		} catch (err: unknown) {
			const e = err as { status?: number; response?: { status?: number } };
			if ((e.status ?? e.response?.status) !== 422) throw err;
		}
	}

	async syncWithDefault(): Promise<SyncResult> {
		const repo = getRepo();
		if (repo.defaultBranch === this._draftBranch) return { behindBy: 0, aheadBy: 0 };

		const status = await this.getStatus();
		if (status.behindBy === 0) return status;

		const octokit = getOctokit();
		try {
			await octokit.request('POST /repos/{owner}/{repo}/merges', {
				owner: repo.owner,
				repo: repo.name,
				base: this._draftBranch,
				head: repo.defaultBranch
			});
			const updated = await this.getStatus();
			return { behindBy: updated.behindBy, aheadBy: updated.aheadBy };
		} catch (err: unknown) {
			const message =
				(err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
				'Failed to update draft from main.';
			return { behindBy: status.behindBy, aheadBy: status.aheadBy, syncError: message };
		}
	}

	async mergeDefaultIntoDraft(): Promise<void> {
		const octokit = getOctokit();
		const repo = getRepo();
		await octokit.request('POST /repos/{owner}/{repo}/merges', {
			owner: repo.owner,
			repo: repo.name,
			base: this._draftBranch,
			head: repo.defaultBranch
		});
	}

	async publish(): Promise<{ success: boolean; error?: string }> {
		const octokit = getOctokit();
		const repo = getRepo();
		const branch = this._draftBranch;

		const { aheadBy } = await this.getStatus();
		if (aheadBy === 0) return { success: true };

		const { data: pr } = await octokit.request('POST /repos/{owner}/{repo}/pulls', {
			owner: repo.owner,
			repo: repo.name,
			title: 'Publish draft changes',
			head: branch,
			base: repo.defaultBranch
		});

		const { data: mergeResult } = await octokit.request(
			'PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge',
			{
				owner: repo.owner,
				repo: repo.name,
				pull_number: pr.number,
				merge_method: 'squash'
			}
		);

		const mergeSha = mergeResult.sha;
		if (!mergeSha) return { success: false, error: 'Merge did not return a commit SHA.' };

		await octokit.request('PATCH /repos/{owner}/{repo}/git/refs/heads/{ref}', {
			owner: repo.owner,
			repo: repo.name,
			ref: branch,
			sha: mergeSha,
			force: true
		});

		return { success: true };
	}

	invalidateCache(): void {
		// Cache invalidation is handled at the repo-cache level.
	}
}

// ---------------------------------------------------------------------------
// LocalContentStore
// ---------------------------------------------------------------------------

class LocalContentStore implements ContentStore {
	readonly branch = 'local';
	readonly isLocal = true;
	private readonly _root: string;

	constructor() {
		// Walk up from cwd to find the git repo root.
		// This mirrors resolveLocalPath in api.ts.
		let root = process.cwd();
		while (true) {
			if (existsSync(resolve(root, '.git'))) break;
			const parent = dirname(root);
			if (parent === root) break;
			root = parent;
		}
		this._root = root;
	}

	private _resolve(repoPath: string): string {
		return resolve(this._root, repoPath);
	}

	async readFile(repoPath: string): Promise<ReadFileResult> {
		const absPath = this._resolve(repoPath);
		const content = await readFile(absPath, 'utf-8');
		const stats = await stat(absPath);
		return {
			content,
			sha: shaFromContent(content),
			size: stats.size,
			downloadUrl: undefined
		};
	}

	readFileSync(repoPath: string): ReadFileResult {
		const absPath = this._resolve(repoPath);
		const content = readFileSync(absPath, 'utf-8');
		return {
			content,
			sha: shaFromContent(content),
			size: Buffer.byteLength(content)
		};
	}

	readBufferSync(repoPath: string): Buffer {
		const absPath = this._resolve(repoPath);
		return readFileSync(absPath);
	}

	async writeFile(repoPath: string, content: string | Buffer, _sha?: string): Promise<{ sha: string }> {
		const absPath = this._resolve(repoPath);
		const dir = dirname(absPath);
		if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

		const data = Buffer.isBuffer(content) ? content : Buffer.from(content);
		await writeFile(absPath, data);
		const str = Buffer.isBuffer(content) ? content.toString('utf-8') : content;
		return { sha: shaFromContent(str) };
	}

	async deleteFile(repoPath: string, _sha?: string): Promise<void> {
		const absPath = this._resolve(repoPath);
		try {
			await rm(absPath, { recursive: true, force: true });
		} catch {
			try { await unlink(absPath); } catch { /* ignore */ }
		}
	}

	deleteFileSync(repoPath: string): void {
		const absPath = this._resolve(repoPath);
		try {
			rmSync(absPath, { recursive: true, force: true });
		} catch {
			try { unlinkSync(absPath); } catch { /* ignore */ }
		}
	}

	async listDirectory(repoPath: string): Promise<ContentEntry[]> {
		const absPath = this._resolve(repoPath);
		if (!existsSync(absPath)) return [];

		const dirents = await readdir(absPath, { withFileTypes: true });
		return dirents
			.filter((d) => d.name !== '.gitkeep')
			.map((d) => ({
				name: d.name,
				path: repoPath ? `${repoPath}/${d.name}` : d.name,
				type: d.isDirectory() ? 'dir' as const : 'file' as const,
				sha: undefined,
				downloadUrl: null
			}));
	}

	async createDirectory(repoPath: string): Promise<void> {
		const absPath = this._resolve(repoPath);
		mkdirSync(absPath, { recursive: true });
		// Also create .gitkeep for consistency with GitHub mode
		const gitkeepPath = resolve(absPath, '.gitkeep');
		if (!existsSync(gitkeepPath)) {
			writeFileSync(gitkeepPath, '');
		}
	}

	async readBuffer(repoPath: string): Promise<Buffer> {
		const absPath = this._resolve(repoPath);
		return readFile(absPath);
	}

	async getTree(rootPath: string): Promise<TreeEntry[]> {
		const absRoot = this._resolve(rootPath);
		if (!existsSync(absRoot)) return [];

		const entries: TreeEntry[] = [];
		// Tree paths must be relative to the repo root (this._root), not
		// the rootPath argument. This matches GitHub API behavior where
		// getTree returns paths relative to the full repo root.
		this._collectTree(this._root, absRoot, entries);
		return entries;
	}

	private _collectTree(repoRoot: string, dirPath: string, result: TreeEntry[]): void {
		let dirents;
		try {
			dirents = readdirSync(dirPath, { withFileTypes: true });
		} catch {
			return;
		}

		for (const d of dirents) {
			if (d.name === '.gitkeep') continue;
			// Skip hidden dotfiles but NOT dot-directories (SvelteKit groups like (site) are fine)
			if (d.name.startsWith('.') && !d.isDirectory()) continue;
			const absPath = resolve(dirPath, d.name);
			const relPath = relative(repoRoot, absPath).replace(/\\/g, '/');

			if (d.isDirectory()) {
				result.push({ path: relPath, type: 'tree' });
				this._collectTree(repoRoot, absPath, result);
			} else {
				result.push({ path: relPath, type: 'blob' });
			}
		}
	}

	async getStatus(): Promise<BranchStatus> {
		return { behindBy: 0, aheadBy: 0 };
	}

	async ensureDraftBranch(): Promise<void> {
		// No-op
	}

	async syncWithDefault(): Promise<SyncResult> {
		return { behindBy: 0, aheadBy: 0 };
	}

	async mergeDefaultIntoDraft(): Promise<void> {
		// No-op
	}

	async publish(): Promise<{ success: boolean; error?: string }> {
		return { success: true };
	}

	invalidateCache(): void {
		// No-op
	}
}

// ---------------------------------------------------------------------------
// Singleton access
// ---------------------------------------------------------------------------

let _store: ContentStore | null = null;

export function getContentStore(): ContentStore {
	if (_store) return _store;

	const mode = process.env.BRIXTER_MODE?.toLowerCase();
	const isLocal = mode === 'local' || (!mode && process.env.NODE_ENV !== 'production');

	if (isLocal) {
		_store = new LocalContentStore();
	} else {
		_store = new GitHubContentStore();
	}
	return _store;
}

export function isLocalMode(): boolean {
	return getContentStore().isLocal;
}

// Exported for direct use in cases where we know we're local (e.g., handle.ts image serving)
export function getLocalStore(): LocalContentStore | null {
	const store = getContentStore();
	return store instanceof LocalContentStore ? store : null;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function normalizeTreeEntries(tree: Array<{ path?: string; type?: string }>): TreeEntry[] {
	return (tree ?? [])
		.filter((item) => item.type === 'tree' || item.type === 'blob')
		.map((item) => ({
			path: item.path as string,
			type: item.type as 'tree' | 'blob'
		}));
}