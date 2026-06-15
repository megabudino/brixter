import { fail, redirect, type RequestEvent } from '@sveltejs/kit';
import { getConfig } from '../../server/config.ts';
import { getContentStore } from '../../server/content-store.ts';
import { isWithinRepoRoot, normalizeRepoPath } from '../../server/sveltekit-routes.ts';
import { matchPage, validateDirectoryName } from '../shared.ts';
import { Buffer } from 'node:buffer';

export async function createMediaDirectoryAction({ request, locals, url }: RequestEvent) {
	if (!locals.user) throw redirect(302, '/admin/login');

	const match = matchPage(url.pathname);
	if (match.page !== 'media' || !match.branch)
		return fail(404, { createDirectoryError: 'Not found.' });

	const formData = await request.formData();
	const name = formData.get('directory_name')?.toString().trim() ?? '';
	const validationError = validateDirectoryName(name);
	if (validationError)
		return fail(400, { createDirectoryError: validationError, directoryName: name });

	const mediaDir = normalizeRepoPath(getConfig().mediaDir) ?? '';
	const currentPath = normalizeRepoPath(match.path ? `${mediaDir}/${match.path}` : mediaDir);
	if (mediaDir && !isWithinRepoRoot(currentPath, mediaDir)) {
		return fail(403, { createDirectoryError: 'Access denied.', directoryName: name });
	}

	const targetDir = `${currentPath}/${name}`;
	if (mediaDir && !isWithinRepoRoot(targetDir, mediaDir)) {
		return fail(403, { createDirectoryError: 'Access denied.', directoryName: name });
	}

	const store = getContentStore();
	try {
		await store.createDirectory(targetDir);
	} catch (err: unknown) {
		const e = err as { response?: { status?: number; data?: { message?: string } } };
		return fail(e.response?.status ?? 500, {
			createDirectoryError: e.response?.data?.message ?? 'Failed to create directory.',
			directoryName: name
		});
	}

	return { createDirectorySuccess: true };
}

export async function uploadMediaAction({ request, locals, url }: RequestEvent) {
	if (!locals.user) throw redirect(302, '/admin/login');

	const match = matchPage(url.pathname);
	if (match.page !== 'media' || !match.branch)
		return fail(404, { uploadError: 'Not found.' });

	const formData = await request.formData();
	const files = formData.getAll('files');
	if (files.length === 0) {
		return fail(400, { uploadError: 'No files provided.' });
	}

	const mediaDir = normalizeRepoPath(getConfig().mediaDir) ?? '';
	const currentPath = normalizeRepoPath(match.path ? `${mediaDir}/${match.path}` : mediaDir);
	if (mediaDir && !isWithinRepoRoot(currentPath, mediaDir)) {
		return fail(403, { uploadError: 'Access denied.' });
	}

	const store = getContentStore();

	for (const file of files) {
		if (!file || typeof (file as any).arrayBuffer !== 'function') {
			continue;
		}

		const fileName = (file as any).name;
		if (!fileName) continue;

		const targetPath = normalizeRepoPath(`${currentPath}/${fileName}`);
		if (mediaDir && !isWithinRepoRoot(targetPath, mediaDir)) {
			return fail(403, { uploadError: `Access denied for ${fileName}.` });
		}

		try {
			const arrayBuffer = await (file as any).arrayBuffer();
			await store.writeFile(targetPath, Buffer.from(arrayBuffer));
		} catch (err: any) {
			const e = err as { response?: { status?: number; data?: { message?: string } } };
			return fail(e.response?.status ?? 500, {
				uploadError: e.response?.data?.message ?? `Upload failed for ${fileName}.`
			});
		}
	}

	return { uploadSuccess: true };
}