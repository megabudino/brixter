import { fail, redirect, type RequestEvent } from '@sveltejs/kit';
import { getContentStore } from '../../server/content-store.ts';
import { invalidateBranchRouteCache } from '../repo-cache.ts';
import { matchPage } from '../shared.ts';

export async function mergeAction({ locals, url }: RequestEvent) {
	if (!locals.user) throw redirect(302, '/admin/login');

	const match = matchPage(url.pathname);
	if (match.page !== 'branch' || !match.branch) return fail(404, { mergeError: 'Not found.' });

	const store = getContentStore();
	try {
		await store.mergeDefaultIntoDraft();
		invalidateBranchRouteCache(match.branch);
	} catch (err: unknown) {
		const e = err as { response?: { status?: number; data?: { message?: string } } };
		return fail(e.response?.status ?? 500, {
			mergeError: e.response?.data?.message ?? 'Merge failed'
		});
	}

	return { mergeSuccess: true };
}