import { mkdir, readdir, rm, copyFile } from 'node:fs/promises';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const packageRoot = fileURLToPath(new URL('..', import.meta.url));
const distDir = join(packageRoot, 'dist');
const excludedDirectories = new Set(['dist', 'node_modules', 'scripts']);

await rm(distDir, { recursive: true, force: true });

const tscResult = spawnSync('bunx', ['tsc', '-p', 'tsconfig.build.json'], {
	cwd: packageRoot,
	stdio: 'inherit'
});

if (tscResult.status !== 0) {
	process.exit(tscResult.status ?? 1);
}

await copySvelteFiles(packageRoot);

async function copySvelteFiles(directory) {
	const entries = await readdir(directory, { withFileTypes: true });

	for (const entry of entries) {
		const sourcePath = join(directory, entry.name);
		const relativePath = relative(packageRoot, sourcePath);

		if (entry.isDirectory()) {
			if (excludedDirectories.has(entry.name)) {
				continue;
			}

			await copySvelteFiles(sourcePath);
			continue;
		}

		if (extname(entry.name) !== '.svelte') {
			continue;
		}

		const destinationPath = join(distDir, relativePath);
		await mkdir(dirname(destinationPath), { recursive: true });
		await copyFile(sourcePath, destinationPath);
	}
}
