/**
 * Programmatic migration runner.
 *
 * Applies every *.sql file in the packaged migrations directory (alphabetical
 * order) to the configured SQLite database, tracking applied filenames in a
 * `_migrations` table so subsequent runs are idempotent.
 *
 * Reads `DATABASE_URL` from process.env by default (NOT $env, so it works
 * from plain Node CLIs and the `brixter` bin).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

export interface MigrateOptions {
	/** SQLite path. Defaults to `process.env.DATABASE_URL` or `data/brixter.db`. */
	databaseUrl?: string;
	/**
	 * Directory containing the `*.sql` migration files. Defaults to the
	 * `migrations/` folder packaged with brixter.
	 */
	migrationsDir?: string;
	/** Logger; defaults to console.log. Pass `() => {}` to silence. */
	log?: (message: string) => void;
}

export interface MigrateResult {
	applied: number;
	appliedFiles: string[];
}

const here = dirname(fileURLToPath(import.meta.url));

function defaultMigrationsDir(): string {
	// This file lives at src/lib/server/migrate.ts (dev) or dist/server/migrate.js
	// (installed). Migrations sit at ../migrations relative to it in both layouts.
	return resolve(here, '../migrations');
}

export async function migrate(options: MigrateOptions = {}): Promise<MigrateResult> {
	const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL ?? 'data/brixter.db';
	const migrationsDir = options.migrationsDir ?? defaultMigrationsDir();
	const log = options.log ?? ((m: string) => console.log(m));

	const db = new Database(databaseUrl);
	db.pragma('journal_mode = WAL');
	db.pragma('foreign_keys = ON');

	db.exec(`
		CREATE TABLE IF NOT EXISTS _migrations (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL UNIQUE,
			applied_at TEXT NOT NULL DEFAULT (datetime('now'))
		)
	`);

	const applied = new Set(
		db
			.prepare('SELECT name FROM _migrations ORDER BY id')
			.all()
			.map((row) => (row as { name: string }).name)
	);

	const files = readdirSync(migrationsDir)
		.filter((f) => f.endsWith('.sql'))
		.sort();

	const appliedFiles: string[] = [];

	for (const file of files) {
		if (applied.has(file)) continue;

		const sql = readFileSync(join(migrationsDir, file), 'utf-8').trim();
		if (!sql) {
			log(`⏭  ${file} (empty, skipping)`);
			continue;
		}

		log(`▶  ${file}`);
		const apply = db.transaction(() => {
			db.exec(sql);
			db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(file);
		});
		apply();
		appliedFiles.push(file);
	}

	if (appliedFiles.length === 0) {
		log('✅ Nothing to migrate — database is up to date.');
	} else {
		log(`✅ Applied ${appliedFiles.length} migration${appliedFiles.length > 1 ? 's' : ''}.`);
	}

	db.close();
	return { applied: appliedFiles.length, appliedFiles };
}
