#!/usr/bin/env node
/**
 * Refreshes already-installed Brixter agent skills on `npm install`.
 *
 * This runs in someone else's project as a lifecycle script, which sets the
 * rules it plays by:
 *
 *   - **Never installs.** It only refreshes when a receipt already exists, so
 *     adding `brixter` as a dependency never scatters agent files into a project
 *     that did not ask for them. `brixter skills install` remains the only way
 *     to opt in.
 *   - **Never fails.** A throwing postinstall breaks `npm install` for the whole
 *     dependency tree. Everything here is wrapped; the worst case is a warning.
 *   - **Never overwrites edits.** It reuses the installer's own modified-file
 *     detection, so a locally edited skill is reported, not clobbered.
 *
 * Lifecycle scripts are best-effort by nature: npm runs them, but pnpm and Bun
 * block dependency scripts unless the package is explicitly trusted, and any
 * `--ignore-scripts` install skips them. `brixter skills status` stays the
 * reliable check.
 */
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const PACKAGE_DIR = fileURLToPath(new URL('../', import.meta.url));
const RECEIPT_PATH = '.brixter/skills-install.json';

main();

async function main() {
	try {
		await refresh();
	} catch (error) {
		// A failed refresh is an inconvenience; a failed install is a broken build.
		process.stderr.write(
			`brixter: could not refresh agent skills — ${error instanceof Error ? error.message : String(error)}\n` +
				`brixter: run \`npx brixter skills install\` when convenient.\n`
		);
	}
	process.exit(0);
}

async function refresh() {
	if (process.env.BRIXTER_SKIP_POSTINSTALL) return;

	// Running from the source checkout rather than an installed copy means this is
	// Brixter's own `npm install`, not a consumer's.
	if (!PACKAGE_DIR.includes(`${path.sep}node_modules${path.sep}`)) return;

	const root = await findInstalledRoot();
	if (!root) return; // Never opted in — nothing to refresh, and not our place to start.

	const receipt = JSON.parse(await readFile(path.join(root, RECEIPT_PATH), 'utf8'));
	const version = JSON.parse(
		await readFile(path.join(PACKAGE_DIR, 'package.json'), 'utf8')
	).version;

	if (receipt.version === version) return; // Already current; stay quiet.

	// User-level installs write outside the project, into $HOME. Refreshing those
	// from a lifecycle script in some unrelated project is too broad a reach.
	if (receipt.global) {
		process.stdout.write(
			`brixter: agent skills were installed user-level and are now v${receipt.version} ` +
				`(package is v${version}). Run \`npx brixter skills install --global\` to refresh.\n`
		);
		return;
	}

	const targets = receipt.targets ?? [];
	if (targets.length === 0) return;

	const { installSkills } = await import('./skills-install.mjs');
	await installSkills({
		cwd: root,
		agents: targets.join(','),
		global: false,
		force: false,
		dryRun: false,
		quiet: true
	});
}

/**
 * The project being installed into. `INIT_CWD` is where the install was invoked,
 * which is the answer whenever the package manager sets it; otherwise walk out of
 * `node_modules` to the directory that owns it.
 */
async function findInstalledRoot() {
	const candidates = [];

	if (process.env.INIT_CWD) candidates.push(process.env.INIT_CWD);

	const marker = `${path.sep}node_modules${path.sep}`;
	const index = PACKAGE_DIR.lastIndexOf(marker);
	if (index !== -1) candidates.push(PACKAGE_DIR.slice(0, index));

	candidates.push(process.cwd());

	for (const candidate of candidates) {
		const root = path.resolve(candidate);
		if (existsSync(path.join(root, RECEIPT_PATH))) return root;
	}
	return null;
}
