import { getDb } from './db.ts';

export interface RepoConfig {
	allowedPaths: string[];
	allowedExtensions: string[];
	mediaPath: string;
}

const DEFAULT_CONFIG: RepoConfig = {
	allowedPaths: ['src/routes', 'src/drafts'],
	allowedExtensions: ['.md', '.yaml', '.yml', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'],
	mediaPath: ''
};

interface RepoConfigRow {
	allowed_paths: string;
	allowed_extensions: string;
	media_path: string;
}

/**
 * Load the singleton repo config. Returns built-in defaults if the row is
 * missing (migration not yet applied, or fresh DB before first save).
 */
export function getRepoConfig(): RepoConfig {
	const row = getDb()
		.prepare('SELECT allowed_paths, allowed_extensions, media_path FROM repo_config WHERE id = 1')
		.get() as RepoConfigRow | undefined;

	if (!row) {
		return DEFAULT_CONFIG;
	}

	return {
		allowedPaths: JSON.parse(row.allowed_paths),
		allowedExtensions: JSON.parse(row.allowed_extensions),
		mediaPath: row.media_path ?? ''
	};
}

/**
 * Upsert the singleton repo config.
 */
export function updateRepoConfig(config: RepoConfig): void {
	getDb()
		.prepare(
			`INSERT INTO repo_config (id, allowed_paths, allowed_extensions, media_path, updated_at)
		 VALUES (1, ?, ?, ?, unixepoch())
		 ON CONFLICT(id) DO UPDATE SET
		   allowed_paths = excluded.allowed_paths,
		   allowed_extensions = excluded.allowed_extensions,
		   media_path = excluded.media_path,
		   updated_at = unixepoch()`
		)
		.run(
			JSON.stringify(config.allowedPaths),
			JSON.stringify(config.allowedExtensions),
			config.mediaPath
		);
}
