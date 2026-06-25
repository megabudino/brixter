import { execFile } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const root = fileURLToPath(new URL('.', import.meta.url));

const packagePaths = {
	brixter: 'packages/brixter/package.json',
	'brix-builder': 'packages/brix-builder/package.json'
};

const args = process.argv.slice(2);
const skipGit = args.includes('--no-git');
const autoConfirm = args.includes('--yes');
const positional = args.filter((arg) => !arg.startsWith('--'));

const [target, bump] = positional;

if (!target || !bump) {
	console.error('Usage: node release.mjs <brixter|all> <patch|minor|major> [--yes] [--no-git]');
	process.exit(1);
}

if (!['brixter', 'all'].includes(target)) {
	console.error(`Unknown target: ${target}. Use "brixter" to release only brixter, or "all" to release both brixter and brix-builder.`);
	process.exit(1);
}

if (!['patch', 'minor', 'major'].includes(bump)) {
	console.error(`Unknown bump type: ${bump}`);
	process.exit(1);
}

function nextVersion(version, type) {
	const [major, minor, patch] = version.split('.').map(Number);

	switch (type) {
		case 'major':
			return `${major + 1}.0.0`;
		case 'minor':
			return `${major}.${minor + 1}.0`;
		case 'patch':
			return `${major}.${minor}.${patch + 1}`;
		default:
			throw new Error(`Unknown bump type: ${type}`);
	}
}

async function readPackage(key) {
	const path = packagePaths[key];
	return {
		key,
		path,
		data: JSON.parse(await readFile(path, 'utf8'))
	};
}

async function writePackage(pkg) {
	await writeFile(pkg.path, `${JSON.stringify(pkg.data, null, '\t')}\n`);
}

async function bumpPackage(key, bumpType) {
	const pkg = await readPackage(key);
	const version = nextVersion(pkg.data.version, bumpType);

	pkg.data.version = version;
	await writePackage(pkg);

	console.log(`${pkg.data.name} -> v${version}`);
	return { name: pkg.data.name, version, path: pkg.path };
}

async function syncBrixBuilderDependency() {
	const builder = await readPackage('brix-builder');
	const brixter = await readPackage('brixter');
	const nextRange = `^${builder.data.version}`;

	if (brixter.data.dependencies?.['@brixter/brix-builder'] === nextRange) {
		console.log(`@brixter/brix-builder already set to ${nextRange}`);
		return null;
	}

	brixter.data.dependencies = {
		...brixter.data.dependencies,
		'@brixter/brix-builder': nextRange
	};
	await writePackage(brixter);

	console.log(`Updated brixter dependency to ${nextRange}`);
	return brixter.path;
}

async function runGit(args) {
	const { stdout, stderr } = await execFileAsync('git', args, { cwd: root });
	if (stdout) process.stdout.write(stdout);
	if (stderr) process.stderr.write(stderr);
}

async function getCurrentBranch() {
	const { stdout } = await execFileAsync('git', ['branch', '--show-current'], { cwd: root });
	return stdout.trim();
}

async function confirm(prompt) {
	const rl = createInterface({ input: process.stdin, output: process.stdout });
	const answer = await rl.question(prompt);
	rl.close();

	const normalized = answer.trim().toLowerCase();
	return normalized === 'y' || normalized === 'yes';
}

const bumped = [];
const stagedFiles = new Set();

if (target === 'all') {
	bumped.push(await bumpPackage('brix-builder', bump));
	stagedFiles.add(bumped.at(-1).path);

	const syncedPath = await syncBrixBuilderDependency();
	if (syncedPath) stagedFiles.add(syncedPath);
}

bumped.push(await bumpPackage('brixter', bump));
stagedFiles.add(bumped.at(-1).path);

const files = [...stagedFiles];
const brixterRelease = bumped.find((item) => item.name === 'brixter');
const builderRelease = bumped.find((item) => item.name === '@brixter/brix-builder');

const tag = `v${brixterRelease.version}`;

let commitMessage;
if (target === 'all') {
	commitMessage = `release packages (brixter ${brixterRelease.version}, @brixter/brix-builder ${builderRelease.version})`;
} else {
	commitMessage = `release brixter ${brixterRelease.version}`;
}

if (skipGit) {
	console.log('Skipped git steps (--no-git).');
	process.exit(0);
}

const branch = await getCurrentBranch();

console.log('');
console.log('Ready to publish with git:');
console.log(`  git add ${files.join(' ')}`);
console.log(`  git commit -m "${commitMessage}"`);
console.log(`  git tag ${tag}`);
console.log(`  git push origin ${branch} --tags`);
console.log('');

const shouldContinue =
	autoConfirm ||
	(await confirm('Continue with commit, tag, and push? [y/N] '));

if (!shouldContinue) {
	console.log('Release cancelled. Version files were updated locally.');
	process.exit(0);
}

await runGit(['add', ...files]);
await runGit(['commit', '-m', commitMessage]);
await runGit(['tag', tag]);
await runGit(['push', 'origin', branch, '--tags']);

console.log(`Released ${tag} on ${branch}.`);
