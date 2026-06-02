/**
 * Programmatic migration runner for brixter apps.
 *
 * `migrate()` runs Better Auth schema migrations first, then every `*.sql` file
 * in the packaged `migrations/` directory (alphabetical order, tracked in
 * `_migrations` so reruns are idempotent).
 *
 * Reads `DATABASE_URL` from process.env by default (NOT $env, so it works
 * from plain Node CLIs and the `brixter` bin).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { migrateAuth, type AuthMigrateOptions } from './auth-migrate.js';

export interface MigrateOptions extends AuthMigrateOptions {
	/**
	 * Directory containing the `*.sql` migration files. Defaults to the
	 * `migrations/` folder packaged with brixter.
	 */
	migrationsDir?: string;
	/** Skip Better Auth schema migrations. */
	skipAuth?: boolean;
	/** Skip brixter SQL migrations. */
	skipBrixter?: boolean;
}

export interface MigrateResult {
	auth: { applied: boolean; createdTables: string[]; addedTables: string[] };
	brixter: { applied: number; appliedFiles: string[] };
}

const here = dirname(fileURLToPath(import.meta.url));

function defaultMigrationsDir(): string {
	const candidates = [
		resolve(here, '../migrations'),
		resolve(here, '../../src/lib/migrations')
	];
	for (const dir of candidates) {
		if (existsSync(dir)) return dir;
	}
	return candidates[0];
}

function resolveDatabasePath(options: MigrateOptions): string {
	const raw = options.databaseUrl ?? process.env.DATABASE_URL ?? 'data/brixter.db';
	if (isAbsolute(raw)) return raw;
	const cwd = options.cwd ?? process.cwd();
	return join(cwd, raw);
}

/**
 * Apply Better Auth schema migrations, then packaged brixter `*.sql` files.
 */
export async function migrate(options: MigrateOptions = {}): Promise<MigrateResult> {
	const databaseUrl = resolveDatabasePath(options);
	const log = options.log ?? ((m: string) => console.log(m));

	const auth = options.skipAuth
		? { applied: false, createdTables: [], addedTables: [] }
		: await migrateAuth({ ...options, databaseUrl, log });

	const brixter = options.skipBrixter
		? { applied: 0, appliedFiles: [] }
		: await migrateBrixterTables({ ...options, databaseUrl, log });

	return { auth, brixter };
}

async function migrateBrixterTables(
	options: MigrateOptions & { databaseUrl: string }
): Promise<{ applied: number; appliedFiles: string[] }> {
	const migrationsDir = options.migrationsDir ?? defaultMigrationsDir();
	const log = options.log ?? ((m: string) => console.log(m));

	const db = new Database(options.databaseUrl);
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

export { migrateAuth, type AuthMigrateOptions, type AuthMigrateResult } from './auth-migrate.js';
