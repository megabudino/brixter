import { createRequire } from 'node:module';
import { getCoreConfig } from './config.ts';

const require = createRequire(import.meta.url);

type SqliteDatabase = import('better-sqlite3').Database;
type BetterSqlite3Module = typeof import('better-sqlite3');

let sqliteModule: BetterSqlite3Module | null = null;
let instance: SqliteDatabase | null = null;

function getSqliteModule(): BetterSqlite3Module {
	if (!sqliteModule) {
		sqliteModule = require('better-sqlite3') as BetterSqlite3Module;
	}
	return sqliteModule;
}

/**
 * Lazily open the SQLite database using the resolved config. The first call
 * applies pragmas; later calls return the cached connection.
 */
export function getDb(): SqliteDatabase {
	if (instance) return instance;
	const { databaseUrl } = getCoreConfig();
	const Database = getSqliteModule();
	instance = new Database(databaseUrl);
	instance.pragma('journal_mode = WAL');
	instance.pragma('foreign_keys = ON');
	return instance;
}
