import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const root = fileURLToPath(new URL('.', import.meta.url));

// Ogni pacchetto ha la sua versione e il suo tag: `<pkg>-v<x.y.z>`.
const packagePaths = {
	core: 'packages/core/package.json',
	brixter: 'packages/brixter/package.json'
};

const [target, bump] = process.argv.slice(2);

if (!packagePaths[target] || !['patch', 'minor', 'major'].includes(bump)) {
	console.error('Usage: node release.mjs <core|brixter> <patch|minor|major>');
	process.exit(1);
}

function nextVersion(version, type) {
	const [major, minor, patch] = version.split('.').map(Number);
	if (type === 'major') return `${major + 1}.0.0`;
	if (type === 'minor') return `${major}.${minor + 1}.0`;
	return `${major}.${minor}.${patch + 1}`;
}

// true se `version` rientra in un range caret ("^x.y.z"), regole 0.x incluse.
function satisfiesCaret(range, version) {
	if (typeof range !== 'string' || !range.startsWith('^')) return false;
	const [rM, rm, rp] = range.slice(1).split('.').map(Number);
	const [vM, vm, vp] = version.split('.').map(Number);
	const geLower = vM > rM || (vM === rM && (vm > rm || (vm === rm && vp >= rp)));
	if (!geLower) return false;
	if (rM > 0) return vM === rM; // ^1.2.3 -> <2.0.0
	if (rm > 0) return vM === 0 && vm === rm; // ^0.1.0 -> <0.2.0
	return vM === 0 && vm === 0 && vp === rp; // ^0.0.3 -> ==0.0.3
}

const readPackage = async (path) => JSON.parse(await readFile(path, 'utf8'));
const writePackage = (path, data) => writeFile(path, `${JSON.stringify(data, null, '\t')}\n`);

const targetPath = packagePaths[target];
const pkg = await readPackage(targetPath);
const version = nextVersion(pkg.version, bump);
pkg.version = version;
await writePackage(targetPath, pkg);
console.log(`${pkg.name} -> v${version}`);

const changedFiles = [targetPath];

// Rilasciando core, se la nuova versione esce dal range di brixter aggiorno la
// dipendenza (altrimenti pubblicheremmo un core che i consumer non risolvono).
if (target === 'core') {
	const brixter = await readPackage(packagePaths.brixter);
	const range = brixter.dependencies?.['@brixter/core'];
	if (range && !satisfiesCaret(range, version)) {
		brixter.dependencies['@brixter/core'] = `^${version}`;
		await writePackage(packagePaths.brixter, brixter);
		changedFiles.push(packagePaths.brixter);
		console.warn(
			`\n⚠ brixter dependency aggiornata: @brixter/core -> ^${version}` +
				`\n  brixter ha ora una modifica non pubblicata: rilascialo con` +
				`\n  node release.mjs brixter patch\n`
		);
	}
}

const tag = `${target}-v${version}`;

async function runGit(args) {
	const { stdout, stderr } = await execFileAsync('git', args, { cwd: root });
	if (stdout) process.stdout.write(stdout);
	if (stderr) process.stderr.write(stderr);
}

const { stdout: branchStdout } = await execFileAsync('git', ['branch', '--show-current'], { cwd: root });
const branch = branchStdout.trim();

await runGit(['add', ...changedFiles]);
await runGit(['commit', '-m', `release ${tag}`]);
await runGit(['tag', tag]);
await runGit(['push', 'origin', branch, '--tags']);

console.log(`Released ${tag} on ${branch}.`);
