import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const packageRoot = fileURLToPath(new URL('..', import.meta.url));
const distDir = join(packageRoot, 'dist');

await rm(distDir, { recursive: true, force: true });

const tscResult = spawnSync('bunx', ['tsc', '-p', 'tsconfig.build.json'], {
	cwd: packageRoot,
	stdio: 'inherit'
});

if (tscResult.status !== 0) {
	process.exit(tscResult.status ?? 1);
}
