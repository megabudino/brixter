import Database from 'better-sqlite3';
import { getCoreConfig } from './config.ts';

let instance: Database.Database | null = null;

/**
 * Lazily open the SQLite database using the resolved config. The first call
 * applies pragmas; later calls return the cached connection.
 */
export function getDb(): Database.Database {
	if (instance) return instance;
	const { databaseUrl } = getCoreConfig();
	instance = new Database(databaseUrl);
	instance.pragma('journal_mode = WAL');
	instance.pragma('foreign_keys = ON');
	return instance;
}
