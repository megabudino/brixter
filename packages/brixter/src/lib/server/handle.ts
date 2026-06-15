import type { Handle } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';
import { building } from '$app/environment';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import {
	isAuthApiPath,
	isBrixterAdminPath,
	isConfigErrorPath,
	isLoginPath,
	isSetupPath
} from './admin-paths.ts';
import { getAuth } from './auth.ts';
import { getAdminPath, getCoreConfig, getCoreConfigIssues } from './config.ts';
import { isSetupComplete } from './setup.ts';
import { isLocalMode, getLocalStore } from './content-store.ts';
import { Buffer } from 'node:buffer';

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'];

/**
 * SvelteKit handle that wires brixter's auth + setup-wizard flow.
 * Mount in your `hooks.server.ts`:
 *
 *   import { handle as brixterHandle } from 'brixter/server';
 *   import { sequence } from '@sveltejs/kit/hooks';
 *   export const handle = sequence(brixterHandle);
 *
 * Responsibilities:
 * - delegates to BetterAuth's SvelteKit adapter for `<adminPath>/api/auth/*`
 *   and the login page
 * - redirects CMS routes to a config error page when required env is missing
 * - forces the setup wizard at `<adminPath>/setup` while there are no users
 *   (only when the request targets CMS routes under `<adminPath>` or `/__brixter`)
 * - blocks the setup page after an admin exists
 * - hydrates `event.locals.{session,user}` from the active session
 */
export const handle: Handle = async ({ event, resolve }) => {
	const path = event.url.pathname;
	const adminPath = getAdminPath();

	if (!isBrixterAdminPath(path, adminPath)) {
		return resolve(event);
	}

	const configIssues = getCoreConfigIssues();
	if (configIssues.length > 0) {
		if (!isConfigErrorPath(path, adminPath)) {
			throw redirect(302, `${adminPath}/config-error`);
		}
		return resolve(event);
	}

	// Serve images from the appropriate source
	const ext = '.' + path.split('.').pop()?.toLowerCase();
	if (IMAGE_EXTENSIONS.includes(ext)) {
		const { mediaDir } = getCoreConfig();
		const repoPath = [mediaDir, path]
			.map((p) => p.replace(/^\/+|\/+$/g, ''))
			.filter(Boolean)
			.join('/');

		// In local mode, read directly from filesystem
		if (isLocalMode()) {
			const localStore = getLocalStore();
			if (localStore) {
				try {
					const buffer = localStore.readBufferSync(repoPath);
					const contentType = path.endsWith('.svg')
						? 'image/svg+xml'
						: path.endsWith('.webp')
							? 'image/webp'
							: path.endsWith('.png')
								? 'image/png'
								: path.endsWith('.gif')
									? 'image/gif'
									: 'image/jpeg';

					return new Response(new Uint8Array(buffer), {
						headers: {
							'Content-Type': contentType,
							'Cache-Control': 'private, max-age=3600'
						}
					});
				} catch {
					// Fall through to normal resolution
				}
			}
		} else {
			// GitHub mode
			try {
				const { getOctokit, getRepo } = await import('./github.ts');
				const octokit = getOctokit();
				const repo = getRepo();
				const { data } = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
					owner: repo.owner,
					repo: repo.name,
					path: repoPath,
					ref: 'brixter-draft'
				});

				const file = data as { content?: string; encoding?: string };
				if (file.content && file.encoding === 'base64') {
					const contentType = path.endsWith('.svg')
						? 'image/svg+xml'
						: path.endsWith('.webp')
							? 'image/webp'
							: path.endsWith('.png')
								? 'image/png'
								: path.endsWith('.gif')
									? 'image/gif'
									: 'image/jpeg';

					return new Response(Buffer.from(file.content, 'base64'), {
						headers: {
							'Content-Type': contentType,
							'Cache-Control': 'private, max-age=3600'
						}
					});
				}
			} catch (err) {
				// Fall through to normal SvelteKit resolution/404 if not found on GitHub
			}
		}
	}

	const { adminPath: configuredAdminPath } = getCoreConfig();
	const setupPath = `${configuredAdminPath}/setup`;
	const auth = getAuth();

	if (isAuthApiPath(path, configuredAdminPath)) {
		return svelteKitHandler({ event, resolve, auth, building });
	}

	if (isLoginPath(path, configuredAdminPath)) {
		if (!isSetupComplete()) {
			throw redirect(302, setupPath);
		}
		return svelteKitHandler({ event, resolve, auth, building });
	}

	if (!isSetupComplete()) {
		if (!isSetupPath(path, configuredAdminPath)) {
			throw redirect(302, setupPath);
		}
		return svelteKitHandler({ event, resolve, auth, building });
	}

	if (isSetupPath(path, configuredAdminPath)) {
		throw redirect(302, configuredAdminPath);
	}

	const session = await auth.api.getSession({ headers: event.request.headers });
	if (session) {
		event.locals.session = session.session;
		event.locals.user = session.user;
	}

	return svelteKitHandler({ event, resolve, auth, building });
};
