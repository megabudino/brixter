import { rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const packageRoot = fileURLToPath(new URL('..', import.meta.url));
const distDir = join(packageRoot, 'dist');

await rm(distDir, { recursive: true, force: true });

for (const project of ['tsconfig.build.json', 'tsconfig.build.server.json']) {
	const tscResult = spawnSync('bunx', ['tsc', '-p', project], {
		cwd: packageRoot,
		stdio: 'inherit'
	});

	if (tscResult.status !== 0) {
		process.exit(tscResult.status ?? 1);
	}
}
