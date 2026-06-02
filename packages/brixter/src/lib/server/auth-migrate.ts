/**
 * Programmatic Better Auth schema migrations (no @better-auth/cli required).
 */
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { betterAuth } from 'better-auth';
import type { BetterAuthOptions } from 'better-auth';
import Database from 'better-sqlite3';

export interface AuthMigrateOptions {
	/** SQLite path. Defaults to `process.env.DATABASE_URL` or `data/brixter.db`. */
	databaseUrl?: string;
	/** Resolve relative `databaseUrl` against this directory. */
	cwd?: string;
	origin?: string;
	authSecret?: string;
	log?: (message: string) => void;
}

export interface AuthMigrateResult {
	applied: boolean;
	createdTables: string[];
	addedTables: string[];
}

function resolveDatabasePath(options: AuthMigrateOptions): string {
	const raw = options.databaseUrl ?? process.env.DATABASE_URL ?? 'data/brixter.db';
	if (isAbsolute(raw)) return raw;
	const cwd = options.cwd ?? process.cwd();
	return join(cwd, raw);
}

/** Shared Better Auth options for CLI config and programmatic migrations. */
export function createAuthOptions(options: AuthMigrateOptions = {}): BetterAuthOptions {
	const databaseUrl = resolveDatabasePath(options);
	mkdirSync(dirname(databaseUrl), { recursive: true });

	return {
		baseURL: options.origin ?? process.env.ORIGIN ?? 'http://localhost:5173',
		secret: options.authSecret ?? process.env.BRIXTER_AUTH_SECRET ?? 'cli-placeholder-secret',
		database: new Database(databaseUrl),
		emailAndPassword: { enabled: true, disableSignUp: true },
		user: {
			additionalFields: {
				role: {
					type: 'string',
					required: false,
					defaultValue: 'user',
					input: false
				}
			}
		}
	};
}

function loadGetMigrations() {
	const require = createRequire(fileURLToPath(import.meta.url));
	const betterAuthRoot = dirname(require.resolve('better-auth'));
	return require(join(betterAuthRoot, 'db/get-migration.mjs')).getMigrations as (
		config: BetterAuthOptions
	) => Promise<{
		toBeCreated: { table: string }[];
		toBeAdded: { table: string }[];
		runMigrations: () => Promise<void>;
	}>;
}

export async function migrateAuth(options: AuthMigrateOptions = {}): Promise<AuthMigrateResult> {
	const log = options.log ?? ((m: string) => console.log(m));
	const auth = betterAuth(createAuthOptions(options));
	const getMigrations = loadGetMigrations();
	const { toBeCreated, toBeAdded, runMigrations } = await getMigrations(auth.options);

	const createdTables = toBeCreated.map((t) => t.table);
	const addedTables = toBeAdded.map((t) => t.table);

	if (createdTables.length === 0 && addedTables.length === 0) {
		log('✅ Better Auth schema is up to date.');
		return { applied: false, createdTables, addedTables };
	}

	log(
		`▶  Better Auth: ${createdTables.length} table(s) to create` +
			(addedTables.length ? `, ${addedTables.length} to alter` : '')
	);
	await runMigrations();
	log('✅ Better Auth migrations applied.');
	return { applied: true, createdTables, addedTables };
}
