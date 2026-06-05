import { readFile, writeFile } from 'node:fs/promises';

const builderPackagePath = new URL('./packages/brix-builder/package.json', import.meta.url);
const brixterPackagePath = new URL('./packages/brixter/package.json', import.meta.url);

const builderPackage = JSON.parse(await readFile(builderPackagePath, 'utf8'));
const brixterPackage = JSON.parse(await readFile(brixterPackagePath, 'utf8'));

const nextVersion = `^${builderPackage.version}`;

if (brixterPackage.dependencies?.['@brixter/brix-builder'] === nextVersion) {
	console.log(`@brixter/brix-builder already set to ${nextVersion}`);
	process.exit(0);
}

brixterPackage.dependencies = {
	...brixterPackage.dependencies,
	'@brixter/brix-builder': nextVersion
};

await writeFile(brixterPackagePath, `${JSON.stringify(brixterPackage, null, '\t')}\n`);
console.log(`Updated brixter dependency to ${nextVersion}`);
