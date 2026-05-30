import { getDb } from './db.ts';

export function isSetupComplete(): boolean {
	const row = getDb().prepare('SELECT COUNT(*) as count FROM "user"').get() as { count: number };
	return row.count > 0;
}
