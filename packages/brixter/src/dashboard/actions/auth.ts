import { fail, redirect, type RequestEvent } from '@sveltejs/kit';
import { getAuth } from '../../server/auth.ts';
import { getActionErrorMessage, applySetCookieHeaders, matchPage } from '../shared.ts';

export async function loginAction({ request, cookies }: RequestEvent) {
	const formData = await request.formData();
	const email = formData.get('email')?.toString().trim() ?? '';
	const password = formData.get('password')?.toString() ?? '';

	if (!email || !password) return fail(400, { message: 'Email and password are required.', email });

	try {
		const result = await getAuth().api.signInEmail({
			body: { email, password },
			headers: request.headers,
			returnHeaders: true
		});
		if (result.headers) applySetCookieHeaders(result.headers, cookies);

		const session = await getAuth().api.getSession({ headers: request.headers });
		if (!session?.user) {
			return fail(500, {
				message:
					'Sign-in succeeded but your session was not saved. Confirm ORIGIN in your environment matches the URL in your browser (including http/https and port), and that cookies are not blocked.',
				email
			});
		}
	} catch (err) {
		if (process.env.NODE_ENV !== 'production') {
			console.error('brixter login failed', err);
		}
		const { message, status } = getActionErrorMessage(err, 'Sign in failed. Please try again.');
		return fail(status, { message, email });
	}

	throw redirect(302, '/admin/routes');
}

export async function setupAction({ request, cookies }: RequestEvent) {
	const formData = await request.formData();
	const name = formData.get('name')?.toString().trim() ?? '';
	const email = formData.get('email')?.toString().trim() ?? '';
	const password = formData.get('password')?.toString() ?? '';
	const confirmPassword = formData.get('confirmPassword')?.toString() ?? '';

	if (!name || !email || !password)
		return fail(400, { message: 'All fields are required.', name, email });
	if (password.length < 8) {
		return fail(400, { message: 'Password must be at least 8 characters.', name, email });
	}
	if (password !== confirmPassword)
		return fail(400, { message: 'Passwords do not match.', name, email });

	try {
		const auth = getAuth();
		await auth.api.signUpEmail({ body: { email, password, name } });
		const result = await auth.api.signInEmail({
			body: { email, password },
			headers: request.headers,
			returnHeaders: true
		});
		if (result.headers) applySetCookieHeaders(result.headers, cookies);
	} catch (err) {
		const { message, status } = getActionErrorMessage(err, 'Account creation failed.');
		return fail(status, { message, name, email });
	}

	throw redirect(302, '/admin/routes');
}

export async function inviteAccountAction({ request, locals }: RequestEvent) {
	if (!locals.user) throw redirect(302, '/admin/login');

	const formData = await request.formData();
	const name = formData.get('name')?.toString().trim() ?? '';
	const email = formData.get('email')?.toString().trim() ?? '';
	const password = formData.get('password')?.toString() ?? '';
	const confirmPassword = formData.get('confirmPassword')?.toString() ?? '';

	if (!name || !email || !password)
		return fail(400, { message: 'All fields are required.', name, email });
	if (password.length < 8) {
		return fail(400, { message: 'Password must be at least 8 characters.', name, email });
	}
	if (password !== confirmPassword)
		return fail(400, { message: 'Passwords do not match.', name, email });

	try {
		await getAuth().api.signUpEmail({ body: { email, password, name } });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Account creation failed.';
		return fail(400, { message, name, email });
	}

	return { success: true };
}