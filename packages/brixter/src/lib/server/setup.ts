import { getDb } from './db.ts';

export function isSetupComplete(): boolean {
	const db = getDb();
	const hasUserTable = db
		.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'user' LIMIT 1")
		.get() as { 1?: number } | undefined;
	if (!hasUserTable) return false;

	const row = db.prepare('SELECT COUNT(*) as count FROM "user"').get() as { count: number };
	return row.count > 0;
}
