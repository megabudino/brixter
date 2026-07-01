import { redirect, type RequestEvent } from '@sveltejs/kit';
import { isSetupComplete } from '../../server/setup.ts';

export async function loadLogin({ locals, url }: RequestEvent) {
	if (!isSetupComplete()) throw redirect(302, '/admin/setup');
	if (locals.user) throw redirect(302, '/admin/routes');

	const reason = url.searchParams.get('reason');
	const notices: Record<string, string> = {
		required: 'Sign in to continue.',
		session:
			'Your session could not be verified. Please sign in again. If this keeps happening, check that ORIGIN matches the URL in your browser.'
	};

	return { notice: reason ? (notices[reason] ?? undefined) : undefined };
}