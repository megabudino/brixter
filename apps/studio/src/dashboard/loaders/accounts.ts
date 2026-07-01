import { redirect, type RequestEvent } from '@sveltejs/kit';
import { getDb } from '../../server/db.ts';

export async function loadAccounts({ locals }: RequestEvent) {
	if (!locals.user) throw redirect(302, '/admin/login');

	const users = getDb()
		.prepare('SELECT id, name, email, createdAt FROM "user" ORDER BY createdAt ASC')
		.all() as Array<{
		id: string;
		name: string;
		email: string;
		createdAt: string;
	}>;

	return { users, currentUserId: locals.user.id };
}