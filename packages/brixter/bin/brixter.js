#!/usr/bin/env node
/**
 * brixter CLI.
 *
 *   brixter init       Wire brixter into a SvelteKit app.
 *   brixter migrate    Apply pending SQL migrations to $DATABASE_URL.
 *
 * For richer integration, import `migrate` from `brixter/server` directly.
 */
import Database from 'better-sqlite3';
import { hashPassword, verifyPassword } from 'better-auth/crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { Writable } from 'node:stream';
import { pathToFileURL, fileURLToPath } from 'node:url';

const command = process.argv[2];
const args = process.argv.slice(3);

function usage() {
	console.log(`Usage:
  brixter init [--cwd <path>] [--admin-path <path>] [--icons <pack>] [--no-icons] [--dry-run]
  brixter reset-password [--email <email>] [--password <password> | --password-stdin] [--cwd <path>]
  brixter migrate`);
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

if (command !== 'migrate') {
	console.error(`Unknown command: ${command}`);
	usage();
	process.exit(1);
}

try {
	const dist = path.resolve(import.meta.dirname, '../dist/server/index.js');
	const source = path.resolve(import.meta.dirname, '../src/lib/server/index.ts');
	const target = existsSync(dist) ? dist : source;
	const { migrate } = await import(pathToFileURL(target).href);
	await migrate();
} catch (err) {
	console.error(err?.message ?? err);
	process.exit(1);
}

function parseInitArgs(argv) {
	const options = {
		cwd: process.cwd(),
		adminPath: '/admin',
		dryRun: false,
		icons: 'lucide'
	};

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === '--dry-run') {
			options.dryRun = true;
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
	const changes = [];
	const skipped = [];
	const manual = [];

	const context = { ...options, changes, skipped, manual };
	assertSvelteKitApp(context);
	ensureRouteShims(context);
	ensureHooks(context);
	ensureVitePlugin(context);
	ensureSvelteExtensions(context);
	ensureTailwindSources(context);
	ensureEnvExample(context);
	if (options.icons && options.icons !== 'none') {
		addIconPack(context, options.icons);
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

function ensureVitePlugin(context) {
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

	contents = addImport(contents, "import { brixter } from 'brixter/vite';");
	contents = contents.replace(
		/plugins\s*:\s*\[/,
		`plugins: [brixter({ adminPath: '${context.adminPath}' }), `
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

function ensureTailwindSources(context) {
	const relativePath = findFirst(context.cwd, [
		'src/routes/layout.css',
		'src/app.css',
		'src/app.postcss'
	]);

	if (!relativePath) {
		context.manual.push('app stylesheet not found; add Tailwind @source entries for brixter');
		return;
	}

	const file = path.join(context.cwd, relativePath);
	let contents = read(file);
	if (
		contents.includes('node_modules/brixter/src/lib/dashboard') ||
		contents.includes('packages/brixter/src/lib/dashboard')
	) {
		context.skipped.push(`${relativePath} already includes brixter Tailwind sources`);
		return;
	}

	const cssDir = path.dirname(file);
	const brixterSources = ['ui', 'editor', 'dashboard']
		.map((name) => {
			const sourcePath = toCssPath(
				path.relative(cssDir, path.join(context.cwd, 'node_modules/brixter/src/lib', name))
			);
			return `@source "${sourcePath}";`;
		})
		.join('\n');
	const builderSourcePath = toCssPath(
		path.relative(
			cssDir,
			path.join(context.cwd, 'node_modules/@brixter/brix-builder/dist')
		)
	);
	const sources = `${brixterSources}\n@source "${builderSourcePath}";`;

	if (contents.includes("@import 'tailwindcss';")) {
		contents = contents.replace("@import 'tailwindcss';", `@import 'tailwindcss';\n${sources}`);
	} else if (contents.includes('@import "tailwindcss";')) {
		contents = contents.replace('@import "tailwindcss";', `@import "tailwindcss";\n${sources}`);
	} else {
		contents = `${sources}\n${contents}`;
	}

	write(context, file, contents);
	context.changes.push(`${relativePath} added brixter Tailwind sources`);
}

function ensureEnvExample(context) {
	const relativePath = '.env.example';
	const file = path.join(context.cwd, relativePath);
	const entries = [
		['ORIGIN', `"http://localhost:5173"`],
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

function toCssPath(value) {
	const normalized = value.split(path.sep).join('/');
	return normalized.startsWith('.') ? normalized : `./${normalized}`;
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
