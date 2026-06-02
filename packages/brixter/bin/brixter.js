#!/usr/bin/env node
/**
 * brixter CLI.
 *
 *   brixter init       Install brixter, wire SvelteKit, and migrate the database.
 *   brixter migrate    Apply Better Auth + brixter SQL migrations to $DATABASE_URL.
 *
 * For richer integration, import `migrate` from `brixter/server` directly.
 */
import Database from 'better-sqlite3';
import { hashPassword, verifyPassword } from 'better-auth/crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { Writable } from 'node:stream';
import { pathToFileURL, fileURLToPath } from 'node:url';

const command = process.argv[2];
const args = process.argv.slice(3);

function usage() {
	console.log(`Usage:
  brixter init [--cwd <path>] [--layout embedded|split] [--cms-dir <path>] [--admin-path <path>] [--icons <pack>] [--no-icons] [--dry-run] [--skip-install] [--skip-migrate]
  brixter reset-password [--email <email>] [--password <password> | --password-stdin] [--cwd <path>]
  brixter migrate [--cwd <path>]`);
}

if (!command || command === '-h' || command === '--help') {
	usage();
	process.exit(command ? 0 : 1);
}

if (command === 'init') {
	try {
		await init(args);
		process.exit(0);
	} catch (err) {
		console.error(err?.message ?? err);
		process.exit(1);
	}
}

if (command === 'reset-password') {
	try {
		await resetPassword(args);
		process.exit(0);
	} catch (err) {
		console.error(err?.message ?? err);
		process.exit(1);
	}
}

if (command === 'migrate') {
	try {
		await runMigrations(parseMigrateArgs(args));
		process.exit(0);
	} catch (err) {
		console.error(err?.message ?? err);
		process.exit(1);
	}
}

console.error(`Unknown command: ${command}`);
usage();
process.exit(1);

function parseInitArgs(argv) {
	const options = {
		cwd: process.cwd(),
		layout: '',
		cmsDir: '',
		adminPath: '/admin',
		dryRun: false,
		skipInstall: false,
		skipMigrate: false,
		icons: 'lucide'
	};

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === '--dry-run') {
			options.dryRun = true;
		} else if (arg === '--skip-install') {
			options.skipInstall = true;
		} else if (arg === '--skip-migrate') {
			options.skipMigrate = true;
		} else if (arg === '--layout') {
			options.layout = argv[++i];
		} else if (arg === '--cms-dir') {
			options.cmsDir = argv[++i];
		} else if (arg === '--cwd') {
			options.cwd = argv[++i];
		} else if (arg === '--admin-path') {
			options.adminPath = argv[++i];
		} else if (arg === '--icons') {
			const next = argv[i + 1];
			if (next && !next.startsWith('--')) {
				options.icons = next;
				i++;
			} else {
				options.icons = 'lucide';
			}
		} else if (arg === '--no-icons') {
			options.icons = 'none';
		} else {
			throw new Error(`Unknown init option: ${arg}`);
		}
	}

	options.cwd = path.resolve(options.cwd);
	if (options.layout && options.layout !== 'embedded' && options.layout !== 'split') {
		throw new Error(`Unknown layout: ${options.layout}. Use "embedded" or "split".`);
	}
	if (options.cmsDir) {
		options.cmsDir = path.resolve(options.cmsDir);
	}
	return options;
}

function parseMigrateArgs(argv) {
	const options = { cwd: process.cwd() };

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === '--cwd') {
			options.cwd = argv[++i];
		} else {
			throw new Error(`Unknown migrate option: ${arg}`);
		}
	}

	options.cwd = path.resolve(options.cwd);
	return options;
}

function parseResetPasswordArgs(argv) {
	const options = {
		cwd: process.cwd(),
		email: '',
		password: '',
		passwordStdin: false
	};

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === '--cwd') {
			options.cwd = argv[++i];
		} else if (arg === '--email') {
			options.email = argv[++i];
		} else if (arg === '--password') {
			options.password = argv[++i];
		} else if (arg === '--password-stdin') {
			options.passwordStdin = true;
		} else {
			throw new Error(`Unknown reset-password option: ${arg}`);
		}
	}

	options.cwd = path.resolve(options.cwd);
	options.email = options.email.trim().toLowerCase();
	return options;
}

async function init(argv) {
	const options = parseInitArgs(argv);
	options.layout = options.layout || (await promptLayout(options));

	const changes = [];
	const skipped = [];
	const manual = [];

	const context = { ...options, changes, skipped, manual };
	assertSvelteKitApp(context);

	if (options.layout === 'split') {
		await initSplit(context);
	} else {
		await initEmbedded(context);
	}

	const changeLabel = options.dryRun ? 'would create/update' : 'created/updated';
	for (const message of changes) console.log(`${changeLabel} ${message}`);
	for (const message of skipped) console.log(`ok ${message}`);
	for (const message of manual) console.log(`manual ${message}`);

	if (options.dryRun) console.log('dry run: no files changed');
	if (manual.length > 0) {
		console.log('\nbrixter init finished with manual steps.');
	} else {
		console.log('\nbrixter init complete.');
	}

	if (options.layout === 'split') {
		const cmsDir = resolveCmsDir(context);
		console.log('\nSplit layout:');
		console.log(`  Site app: ${context.cwd} (page builder only)`);
		console.log(`  CMS app:  ${cmsDir}`);
		console.log('  Start the site with your usual dev command.');
		console.log(`  Start the CMS from ${cmsDir} with npm run dev.`);
	}
}

async function promptLayout(options) {
	if (!process.stdin.isTTY) return 'embedded';

	console.log('\nWhere should Brixter run?\n');
	console.log('  1) Same app as my site (default)');
	console.log('  2) Separate CMS app\n');

	const answer = (await prompt('Choice [1]: ')).trim();
	if (!answer || answer === '1') return 'embedded';
	if (answer === '2') return 'split';
	throw new Error('Invalid choice. Enter 1 or 2.');
}

async function initEmbedded(context) {
	ensureBrixterPackage(context);
	ensureRouteShims(context);
	ensureHooks(context);
	ensureVitePlugin(context);
	ensureSvelteExtensions(context);
	ensureEnvExample(context);
	ensureDotEnv(context);
	if (context.icons && context.icons !== 'none') {
		addIconPack(context, context.icons);
	}
	ensureBrixterLayout(context);
	await setupDatabase(context);
}

async function initSplit(context) {
	const siteAppRoot = resolveSiteAppRoot(context.cwd);
	const cmsDir = resolveCmsDir(context);
	const cmsNeedsScaffold = !existsSync(path.join(cmsDir, 'package.json'));

	initSplitSite(context);

	if (cmsNeedsScaffold) {
		scaffoldCmsAppSkeleton(context, cmsDir, siteAppRoot);
		ensureWorkspaceEntry(context, cmsDir);
	} else {
		context.skipped.push(`${displayPath(context.cwd, cmsDir)} cms app already exists`);
	}

	if (context.dryRun && cmsNeedsScaffold) {
		context.changes.push(
			`${displayPath(context.cwd, cmsDir)}/ would receive admin routes, hooks, env, and database migrations`
		);
		return;
	}

	const cmsContext = { ...context, cwd: cmsDir };
	assertSvelteKitApp(cmsContext);
	ensureBrixterPackage(cmsContext);
	ensureRouteShims(cmsContext);
	ensureHooks(cmsContext);
	ensureVitePlugin(cmsContext, { appRoot: siteAppRoot });
	ensureSvelteExtensions(cmsContext);
	ensureCmsEnvExample(cmsContext);
	ensureDotEnv(cmsContext);
	ensureBrixterLayout(cmsContext);
	await setupDatabase(cmsContext);
}

function initSplitSite(context) {
	ensureBrixterPackage(context);
	ensureVitePlugin(context);
	ensureSvelteExtensions(context);
	ensureSiteEnvExample(context);
	ensureDotEnv(context);
	if (context.icons && context.icons !== 'none') {
		addIconPack(context, context.icons);
	}
}

async function resetPassword(argv) {
	const options = parseResetPasswordArgs(argv);
	if (options.password && options.passwordStdin) {
		throw new Error('Use either --password or --password-stdin, not both');
	}

	const email = options.email || (await prompt('Email: ')).trim().toLowerCase();
	if (!email) throw new Error('Email is required');

	const isInteractivePassword = !options.passwordStdin && !options.password;
	const password = options.passwordStdin
		? await readStdin()
		: options.password || (await promptHidden('New password: '));
	if (!password) throw new Error('reset-password requires --password or --password-stdin');
	if (password.length < 8) throw new Error('Password must be at least 8 characters');
	if (isInteractivePassword) {
		const confirmation = await promptHidden('Confirm password: ');
		if (password !== confirmation) throw new Error('Passwords do not match');
	}

	const databaseUrl = resolveDatabaseUrl(options.cwd);
	const db = new Database(databaseUrl);
	try {
		const user = db.prepare('SELECT id, email FROM "user" WHERE lower(email) = ?').get(email);
		if (!user) throw new Error(`No user found for ${email}`);

		const account = db
			.prepare('SELECT id FROM account WHERE userId = ? AND providerId = ?')
			.get(user.id, 'credential');
		if (!account) throw new Error(`User ${email} has no credential account`);

		const hashed = await hashPassword(password);
		if (!(await verifyPassword({ hash: hashed, password }))) {
			throw new Error('Password hash verification failed');
		}
		db.prepare('UPDATE account SET password = ?, updatedAt = ? WHERE id = ?').run(
			hashed,
			new Date().toISOString(),
			account.id
		);
		db.prepare('DELETE FROM session WHERE userId = ?').run(user.id);
		console.log(`Password reset for ${user.email}; existing sessions revoked.`);
	} finally {
		db.close();
	}
}

function assertSvelteKitApp({ cwd }) {
	if (!existsSync(path.join(cwd, 'package.json'))) {
		throw new Error(`No package.json found in ${cwd}`);
	}
	if (!existsSync(path.join(cwd, 'src'))) {
		throw new Error(`No src directory found in ${cwd}`);
	}
}

function read(file) {
	return readFileSync(file, 'utf-8');
}

async function readStdin() {
	let value = '';
	for await (const chunk of process.stdin) value += chunk;
	return value.trimEnd();
}

async function prompt(message) {
	if (!process.stdin.isTTY) throw new Error(`Missing value for prompt "${message.trim()}"`);

	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout
	});
	try {
		return await new Promise((resolve) => {
			rl.question(message, resolve);
		});
	} finally {
		rl.close();
	}
}

async function promptHidden(message) {
	if (!process.stdin.isTTY) throw new Error(`Missing value for prompt "${message.trim()}"`);

	const silentOutput = new Writable({
		write(_chunk, _encoding, callback) {
			callback();
		}
	});

	process.stdout.write(message);
	const rl = readline.createInterface({
		input: process.stdin,
		output: silentOutput,
		terminal: true
	});

	try {
		const answer = await new Promise((resolve) => {
			rl.question('', resolve);
		});
		process.stdout.write('\n');
		return answer;
	} finally {
		rl.close();
	}
}

function resolveDatabaseUrl(cwd) {
	const env = readEnvFile(path.join(cwd, '.env'));
	const value = process.env.DATABASE_URL || env.DATABASE_URL || 'data/brixter.db';
	return path.isAbsolute(value) ? value : path.join(cwd, value);
}

function readEnvFile(file) {
	if (!existsSync(file)) return {};

	const env = {};
	const lines = read(file).split(/\r?\n/);
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (!line || line.trimStart().startsWith('#')) continue;

		const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
		if (!match) continue;

		let value = match[2].trim();
		if (value.startsWith('"')) {
			value = value.slice(1);
			while (!value.endsWith('"') && i < lines.length - 1) {
				i++;
				value += `\n${lines[i]}`;
			}
			if (value.endsWith('"')) value = value.slice(0, -1);
			value = value.replace(/\\n/g, '\n');
		}
		env[match[1]] = value;
	}

	return env;
}

function write(context, file, contents) {
	if (!context.dryRun) {
		mkdirSync(path.dirname(file), { recursive: true });
		writeFileSync(file, contents);
	}
}

function createFile(context, relativePath, contents) {
	const file = path.join(context.cwd, relativePath);
	if (existsSync(file)) {
		if (read(file) === contents) {
			context.skipped.push(`${relativePath} already configured`);
			return;
		}
		context.manual.push(`${relativePath} already exists; review before changing it`);
		return;
	}

	write(context, file, contents);
	context.changes.push(relativePath);
}

function ensureRouteShims(context) {
	createFile(
		context,
		'src/routes/__brixter/[...path]/+page.server.ts',
		"export { actions, load } from 'brixter/sveltekit/server';\n"
	);
	createFile(
		context,
		'src/routes/__brixter/[...path]/+page.svelte',
		`<script lang="ts">
	import Brixter from 'brixter/sveltekit';

	let { data, form } = $props();
</script>

<Brixter {data} {form} />
`
	);
	createFile(
		context,
		'src/routes/__brixter/api/[...api]/+server.ts',
		"export { GET } from 'brixter/sveltekit/api';\n"
	);
}

function ensureBrixterLayout(context) {
	createFile(
		context,
		'src/routes/__brixter/+layout.svelte',
		`<script lang="ts">
	import 'brixter/styles.css';

	let { children } = $props();
</script>

{@render children()}
`
	);
}

function ensureHooks(context) {
	ensureClientHooks(context);
	ensureServerHooks(context);
}

function ensureClientHooks(context) {
	const relativePath = 'src/hooks.ts';
	const file = path.join(context.cwd, relativePath);
	const brixterExport = "export { reroute } from 'brixter/sveltekit';\n";

	if (!existsSync(file)) {
		write(context, file, brixterExport);
		context.changes.push(relativePath);
		return;
	}

	const contents = read(file);
	if (contents.includes('brixter/sveltekit')) {
		context.skipped.push(`${relativePath} already uses brixter reroute`);
		return;
	}

	if (!/\breroute\b/.test(contents.trim())) {
		write(context, file, `${contents.trimEnd()}\n\n${brixterExport}`);
		context.changes.push(`${relativePath} appended brixter reroute`);
		return;
	}

	context.manual.push(
		`${relativePath} already defines reroute; compose it with reroute from 'brixter/sveltekit'`
	);
}

function ensureServerHooks(context) {
	const relativePath = 'src/hooks.server.ts';
	const file = path.join(context.cwd, relativePath);
	const defaultContents = `import { sequence } from '@sveltejs/kit/hooks';
import { handle as brixterHandle } from 'brixter/server';

export const handle = sequence(brixterHandle);
`;

	if (!existsSync(file)) {
		write(context, file, defaultContents);
		context.changes.push(relativePath);
		return;
	}

	let contents = read(file);
	if (contents.includes('brixter/server')) {
		context.skipped.push(`${relativePath} already uses brixter handle`);
		return;
	}

	if (!contents.includes("from '@sveltejs/kit/hooks'")) {
		contents = `import { sequence } from '@sveltejs/kit/hooks';\n${contents}`;
	}
	if (!contents.includes("from 'brixter/server'")) {
		contents = `import { handle as brixterHandle } from 'brixter/server';\n${contents}`;
	}

	const sequenceMatch = contents.match(/export\s+const\s+handle\s*=\s*sequence\(([^)]*)\)/s);
	if (sequenceMatch) {
		const currentHandles = sequenceMatch[1].trim();
		const nextHandles = currentHandles ? `${currentHandles}, brixterHandle` : 'brixterHandle';
		contents = contents.replace(sequenceMatch[0], `export const handle = sequence(${nextHandles})`);
		write(context, file, contents);
		context.changes.push(`${relativePath} appended brixter handle`);
		return;
	}

	if (!/\bhandle\b/.test(contents)) {
		write(
			context,
			file,
			`${contents.trimEnd()}\n\nexport const handle = sequence(brixterHandle);\n`
		);
		context.changes.push(`${relativePath} added brixter handle`);
		return;
	}

	context.manual.push(
		`${relativePath} already defines handle; compose it with handle from 'brixter/server'`
	);
}

function ensureVitePlugin(context, pluginOptions = {}) {
	const relativePath = findFirst(context.cwd, ['vite.config.ts', 'vite.config.js']);
	if (!relativePath) {
		context.manual.push("vite config not found; add brixter() from 'brixter/vite' to plugins");
		return;
	}

	const file = path.join(context.cwd, relativePath);
	let contents = read(file);
	if (contents.includes('brixter/vite')) {
		context.skipped.push(`${relativePath} already uses brixter vite plugin`);
		return;
	}

	if (!/plugins\s*:\s*\[/.test(contents)) {
		context.manual.push(`${relativePath} has no simple plugins array; add brixter() manually`);
		return;
	}

	const brixterOptions = [`adminPath: '${context.adminPath}'`];
	if (pluginOptions.appRoot) {
		brixterOptions.push(`appRoot: '${pluginOptions.appRoot}'`);
	}

	contents = addImport(contents, "import { brixter } from 'brixter/vite';");
	contents = contents.replace(
		/plugins\s*:\s*\[/,
		`plugins: [brixter({ ${brixterOptions.join(', ')} }), `
	);
	write(context, file, contents);
	context.changes.push(`${relativePath} added brixter vite plugin`);
}

function ensureSvelteExtensions(context) {
	const relativePath = findFirst(context.cwd, ['svelte.config.js', 'svelte.config.ts']);
	if (!relativePath) {
		context.manual.push(
			"svelte config not found; add '.brix.yaml' and '.brix.yml' to config.extensions"
		);
		return;
	}

	const file = path.join(context.cwd, relativePath);
	let contents = read(file);
	if (contents.includes("'.brix.yaml'") && contents.includes("'.brix.yml'")) {
		context.skipped.push(`${relativePath} already enables brix yaml extensions`);
		return;
	}

	const extensionsMatch = contents.match(/extensions\s*:\s*\[([^\]]*)\]/s);
	if (extensionsMatch) {
		const current = extensionsMatch[1];
		const additions = [];
		if (!current.includes("'.brix.yaml'") && !current.includes('".brix.yaml"')) {
			additions.push("'.brix.yaml'");
		}
		if (!current.includes("'.brix.yml'") && !current.includes('".brix.yml"')) {
			additions.push("'.brix.yml'");
		}
		if (additions.length === 0) {
			context.skipped.push(`${relativePath} already enables brix yaml extensions`);
			return;
		}

		const separator = current.trim() ? ', ' : '';
		contents = contents.replace(
			extensionsMatch[0],
			`extensions: [${current}${separator}${additions.join(', ')}]`
		);
		write(context, file, contents);
		context.changes.push(`${relativePath} added brix yaml extensions`);
		return;
	}

	if (/const\s+config\s*=\s*\{/.test(contents)) {
		contents = contents.replace(
			/const\s+config\s*=\s*\{/,
			`const config = {\n\textensions: ['.svelte', '.brix.yaml', '.brix.yml'],`
		);
		write(context, file, contents);
		context.changes.push(`${relativePath} added brix yaml extensions`);
		return;
	}

	context.manual.push(
		`${relativePath} has no simple config object; add brix yaml extensions manually`
	);
}

function ensureEnvExample(context) {
	ensureEnvEntries(context, '.env.example', embeddedEnvEntries());
}

function ensureSiteEnvExample(context) {
	ensureEnvEntries(context, '.env.example', siteEnvEntries());
}

function ensureCmsEnvExample(context) {
	ensureEnvEntries(context, '.env.example', cmsEnvEntries());
}

function embeddedEnvEntries() {
	return [
		['DATABASE_URL', 'data/brixter.db'],
		['ORIGIN', '"http://localhost:5173"'],
		['BRIXTER_AUTH_SECRET', '"change-me"'],
		['GITHUB_APP_ID', '""'],
		['GITHUB_PRIVATE_KEY', '""'],
		['GITHUB_INSTALLATION_ID', '""'],
		['GITHUB_REPO_OWNER', '""'],
		['GITHUB_REPO_NAME', '""'],
		['GITHUB_DEFAULT_BRANCH', '""'],
		['BRIXTER_SOURCE_REPO', '""'],
		['BRIXTER_SOURCE_DEFAULT_BRANCH', '""'],
		['BRIXTER_SOURCE_COMMIT', '""']
	];
}

function siteEnvEntries() {
	return [
		['BRIXTER_CMS_URL', '"http://localhost:5174"'],
		['BRIXTER_SOURCE_REPO', '""'],
		['BRIXTER_SOURCE_DEFAULT_BRANCH', '""'],
		['BRIXTER_SOURCE_COMMIT', '""']
	];
}

function cmsEnvEntries() {
	return [
		['DATABASE_URL', 'data/brixter.db'],
		['ORIGIN', '"http://localhost:5174"'],
		['BRIXTER_AUTH_SECRET', '"change-me"'],
		['GITHUB_APP_ID', '""'],
		['GITHUB_PRIVATE_KEY', '""'],
		['GITHUB_INSTALLATION_ID', '""'],
		['GITHUB_REPO_OWNER', '""'],
		['GITHUB_REPO_NAME', '""'],
		['GITHUB_DEFAULT_BRANCH', '""'],
		['BRIXTER_SOURCE_REPO', '""'],
		['BRIXTER_SOURCE_DEFAULT_BRANCH', '""'],
		['BRIXTER_SOURCE_COMMIT', '""']
	];
}

function ensureEnvEntries(context, relativePath, entries) {
	const file = path.join(context.cwd, relativePath);
	const existing = existsSync(file) ? read(file) : '';
	const missing = entries.filter(([key]) => !new RegExp(`^${key}=`, 'm').test(existing));
	if (missing.length === 0) {
		context.skipped.push(`${relativePath} already documents brixter env vars`);
		return;
	}

	const block = [
		existing.trimEnd(),
		'',
		'# Brixter',
		...missing.map(([key, value]) => `${key}=${value}`),
		''
	]
		.filter(Boolean)
		.join('\n');

	write(context, file, `${block}\n`);
	context.changes.push(`${relativePath} documented brixter env vars`);
}

function resolveGitRepoRoot(cwd) {
	const result = spawnSync('git', ['rev-parse', '--show-toplevel'], {
		cwd,
		encoding: 'utf-8'
	});
	if (result.status === 0) return result.stdout.trim();
	return cwd;
}

function resolveSiteAppRoot(siteCwd) {
	const repoRoot = resolveGitRepoRoot(siteCwd);
	const relative = path.relative(repoRoot, siteCwd).split(path.sep).join('/');
	if (relative && relative !== '.') return relative;
	return path.basename(siteCwd);
}

function resolveCmsDir(context) {
	if (context.cmsDir) return context.cmsDir;
	return path.resolve(context.cwd, '..', 'cms');
}

function displayPath(fromCwd, targetPath) {
	return path.relative(fromCwd, targetPath).split(path.sep).join('/') || '.';
}

function readBrixterDependencySpec(cwd) {
	const pkgPath = path.join(cwd, 'package.json');
	if (!existsSync(pkgPath)) return `^${readBrixterPackageVersion()}`;
	const pkg = JSON.parse(read(pkgPath));
	return pkg.dependencies?.brixter ?? pkg.devDependencies?.brixter ?? `^${readBrixterPackageVersion()}`;
}

function monorepoSvelteAliasesBlock() {
	return `\t\talias: {
\t\t\t'@brixter/brix-builder': '../packages/brix-builder/index.ts',
\t\t\t'brixter/server': '../packages/brixter/src/lib/server/index.ts',
\t\t\t'brixter/editor': '../packages/brixter/src/lib/editor/index.ts',
\t\t\t'brixter/ui': '../packages/brixter/src/lib/ui/index.ts',
\t\t\t'brixter/sveltekit/server': '../packages/brixter/src/lib/sveltekit/server.ts',
\t\t\t'brixter/sveltekit/api': '../packages/brixter/src/lib/sveltekit/api.ts',
\t\t\t'brixter/sveltekit': '../packages/brixter/src/lib/sveltekit/index.ts',
\t\t\t'brixter/styles.css': '../packages/brixter/styles.css'
\t\t}`;
}

function usesMonorepoBrixterAliases(cwd) {
	const svelteConfig = findFirst(cwd, ['svelte.config.js', 'svelte.config.ts']);
	if (!svelteConfig) return false;
	return read(path.join(cwd, svelteConfig)).includes('packages/brixter/src/lib/server');
}

function scaffoldCmsAppSkeleton(context, cmsDir, siteAppRoot) {
	const cmsName = path.basename(cmsDir);
	const brixterSpec = readBrixterDependencySpec(context.cwd);
	const aliasBlock = usesMonorepoBrixterAliases(context.cwd) ? `\n${monorepoSvelteAliasesBlock()},` : '';

	const files = {
		'package.json': `${JSON.stringify(
			{
				name: cmsName,
				private: true,
				version: '0.0.1',
				type: 'module',
				dependencies: {
					brixter: brixterSpec
				},
				scripts: {
					dev: 'vite dev --port 5174',
					build: 'vite build',
					preview: 'vite preview --port 5174',
					prepare: "svelte-kit sync || echo ''",
					'db:migrate': 'brixter migrate'
				},
				devDependencies: {
					'@sveltejs/adapter-auto': '^7.0.0',
					'@sveltejs/kit': '^2.50.2',
					'@sveltejs/vite-plugin-svelte': '^6.2.4',
					'@tailwindcss/vite': '^4.1.18',
					'@types/node': '^22',
					svelte: '^5.54.0',
					tailwindcss: '^4.1.18',
					typescript: '^5.9.3',
					vite: '^7.3.1'
				}
			},
			null,
			2
		)}\n`,
		'vite.config.ts': `import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { brixter } from 'brixter/vite';

export default defineConfig({
	plugins: [
		tailwindcss(),
		brixter({ adminPath: '${context.adminPath}', appRoot: '${siteAppRoot}' }),
		sveltekit()
	],
	ssr: {
		noExternal: ['brixter', 'lucide-svelte']
	}
});
`,
		'svelte.config.js': `import adapter from '@sveltejs/adapter-auto';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	extensions: ['.svelte', '.brix.yaml', '.brix.yml'],
	kit: {
		adapter: adapter(),${aliasBlock}
	}
};

export default config;
`,
		'tsconfig.json': `{
	"extends": "./.svelte-kit/tsconfig.json",
	"compilerOptions": {
		"allowJs": true,
		"checkJs": true,
		"esModuleInterop": true,
		"forceConsistentCasingInFileNames": true,
		"resolveJsonModule": true,
		"skipLibCheck": true,
		"sourceMap": true,
		"strict": true,
		"moduleResolution": "bundler"
	}
}
`,
		'src/app.html': `<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		%sveltekit.head%
	</head>
	<body data-sveltekit-preload-data="hover">
		<div style="display: contents">%sveltekit.body%</div>
	</body>
</html>
`,
		'src/routes/+page.server.ts': `import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	throw redirect(302, '${context.adminPath}');
};
`
	};

	for (const [relativePath, contents] of Object.entries(files)) {
		const cmsContext = { ...context, cwd: cmsDir };
		createFile(cmsContext, relativePath, contents);
	}

	context.changes.push(`${displayPath(context.cwd, cmsDir)}/ (scaffolded CMS app)`);
}

function ensureWorkspaceEntry(context, cmsDir) {
	const repoRoot = resolveGitRepoRoot(context.cwd);
	const workspaceFile = path.join(repoRoot, 'package.json');
	if (!existsSync(workspaceFile)) return;

	const pkg = JSON.parse(read(workspaceFile));
	if (!Array.isArray(pkg.workspaces)) return;

	const cmsRel = path.relative(repoRoot, cmsDir).split(path.sep).join('/');
	if (pkg.workspaces.includes(cmsRel)) {
		context.skipped.push(`workspace already includes ${cmsRel}`);
		return;
	}

	pkg.workspaces.push(cmsRel);
	if (!context.dryRun) {
		writeFileSync(workspaceFile, `${JSON.stringify(pkg, null, 2)}\n`);
	}
	context.changes.push(`package.json added workspace ${cmsRel}`);
}

function ensureDotEnv(context) {
	const relativePath = '.env';
	const envFile = path.join(context.cwd, relativePath);
	const exampleFile = path.join(context.cwd, '.env.example');

	if (existsSync(envFile)) {
		context.skipped.push(`${relativePath} already exists`);
		return;
	}

	if (!existsSync(exampleFile)) {
		context.manual.push(
			`create ${relativePath} with the required Brixter env vars before starting the app`
		);
		return;
	}

	if (context.dryRun) {
		context.changes.push(`${relativePath} would be created from .env.example`);
		return;
	}

	copyFileSync(exampleFile, envFile);
	context.changes.push(`${relativePath} created from .env.example`);
}

function readBrixterPackageVersion() {
	const pkgPath = path.resolve(import.meta.dirname, '../package.json');
	return JSON.parse(read(pkgPath)).version;
}

function detectPackageManager(cwd) {
	if (existsSync(path.join(cwd, 'bun.lock')) || existsSync(path.join(cwd, 'bun.lockb'))) {
		return 'bun';
	}
	if (existsSync(path.join(cwd, 'pnpm-lock.yaml'))) return 'pnpm';
	if (existsSync(path.join(cwd, 'yarn.lock'))) return 'yarn';
	return 'npm';
}

function hasBrixterDependency(pkg) {
	return Boolean(pkg.dependencies?.brixter ?? pkg.devDependencies?.brixter);
}

function findInstalledBrixterPackageJson(cwd) {
	let dir = cwd;
	while (true) {
		const candidate = path.join(dir, 'node_modules/brixter/package.json');
		if (existsSync(candidate)) return candidate;
		const parent = path.dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	return '';
}

function ensureBrixterPackage(context) {
	if (context.skipInstall) {
		context.skipped.push('package install skipped (--skip-install)');
		return;
	}

	const pkgPath = path.join(context.cwd, 'package.json');
	const pkg = JSON.parse(read(pkgPath));
	const installedPath = findInstalledBrixterPackageJson(context.cwd);

	if (hasBrixterDependency(pkg) && installedPath) {
		context.skipped.push('brixter is already installed');
		return;
	}

	const version = readBrixterPackageVersion();

	if (!hasBrixterDependency(pkg)) {
		pkg.dependencies ??= {};
		pkg.dependencies.brixter = `^${version}`;
		if (context.dryRun) {
			context.changes.push(`package.json would add brixter@^${version}`);
		} else {
			writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
			context.changes.push(`package.json added brixter@^${version}`);
		}
	} else if (!installedPath) {
		context.skipped.push('package.json already lists brixter');
	}

	if (context.dryRun) {
		context.changes.push(`would run ${detectPackageManager(context.cwd)} install`);
		return;
	}

	runPackageInstall(context);
}

function runPackageInstall(context) {
	const pm = detectPackageManager(context.cwd);
	const args =
		pm === 'bun'
			? ['install']
			: pm === 'pnpm'
				? ['install']
				: pm === 'yarn'
					? ['install']
					: ['install'];
	const command = pm === 'npm' ? (process.platform === 'win32' ? 'npm.cmd' : 'npm') : pm;
	const result = spawnSync(command, args, {
		cwd: context.cwd,
		stdio: 'inherit',
		env: process.env
	});

	if (result.status !== 0) {
		throw new Error(`${command} ${args.join(' ')} failed`);
	}

	context.changes.push(`ran ${command} ${args.join(' ')}`);
}

function loadEnvIntoProcess(cwd) {
	const env = readEnvFile(path.join(cwd, '.env'));
	for (const [key, value] of Object.entries(env)) {
		if (process.env[key] === undefined) process.env[key] = value;
	}
}

async function resolveMigrateModule() {
	const dist = path.resolve(import.meta.dirname, '../dist/server/migrate.js');
	const source = path.resolve(import.meta.dirname, '../src/lib/server/migrate.ts');
	const target = existsSync(dist) ? dist : source;
	return pathToFileURL(target).href;
}

async function runMigrations({ cwd }) {
	loadEnvIntoProcess(cwd);
	const { migrate } = await import(await resolveMigrateModule());
	await migrate({ cwd });
}

async function setupDatabase(context) {
	if (context.skipMigrate) {
		context.skipped.push('database setup skipped (--skip-migrate)');
		return;
	}

	if (context.dryRun) {
		context.changes.push('would run Better Auth and brixter database migrations');
		return;
	}

	if (!findInstalledBrixterPackageJson(context.cwd)) {
		throw new Error('brixter is not installed in node_modules; run init without --skip-install first');
	}

	await runMigrations({ cwd: context.cwd });
	context.changes.push('database migrations applied (Better Auth + brixter)');
}

function findFirst(cwd, candidates) {
	return candidates.find((candidate) => existsSync(path.join(cwd, candidate)));
}

function addImport(contents, statement) {
	if (contents.includes(statement)) return contents;
	const importMatches = [...contents.matchAll(/^import .*;$/gm)];
	if (importMatches.length === 0) return `${statement}\n${contents}`;
	const last = importMatches.at(-1);
	const insertAt = last.index + last[0].length;
	return `${contents.slice(0, insertAt)}\n${statement}${contents.slice(insertAt)}`;
}

function addIconPack(context, packName) {
	if (packName === 'none') return;
	if (packName !== 'lucide') {
		throw new Error(`Unsupported icon pack: ${packName}`);
	}

	const relativeTargetDir = `src/lib/brixter/icons/${packName}`;
	const targetDir = path.join(context.cwd, relativeTargetDir);

	if (existsSync(targetDir)) {
		context.skipped.push(`${relativeTargetDir} directory already configured`);
		return;
	}

	let sourceDir = '';
	try {
		const resolved = import.meta.resolve('lucide-static/package.json');
		const pkgPath = fileURLToPath(resolved);
		sourceDir = path.join(path.dirname(pkgPath), 'icons');
	} catch (e) {
		try {
			const resolved = import.meta.resolve('lucide-static');
			const pkgPath = fileURLToPath(resolved);
			const mainDir = path.dirname(pkgPath);
			if (existsSync(path.join(mainDir, '../../icons'))) {
				sourceDir = path.join(mainDir, '../../icons');
			} else if (existsSync(path.join(mainDir, 'icons'))) {
				sourceDir = path.join(mainDir, 'icons');
			} else if (existsSync(path.join(mainDir, '../icons'))) {
				sourceDir = path.join(mainDir, '../icons');
			}
		} catch (innerErr) {
			sourceDir = path.resolve(import.meta.dirname, '../node_modules/lucide-static/icons');
			if (!existsSync(sourceDir)) {
				sourceDir = path.resolve(import.meta.dirname, '../../../../node_modules/lucide-static/icons');
			}
		}
	}

	if (!existsSync(sourceDir)) {
		throw new Error(`Could not find lucide-static source icons directory at ${sourceDir}`);
	}

	if (!context.dryRun) {
		mkdirSync(targetDir, { recursive: true });
		const files = readdirSync(sourceDir);
		for (const file of files) {
			if (file.endsWith('.svg')) {
				copyFileSync(path.join(sourceDir, file), path.join(targetDir, file));
			}
		}
	}

	context.changes.push(`${relativeTargetDir} (copied all Lucide SVG icons)`);
}
