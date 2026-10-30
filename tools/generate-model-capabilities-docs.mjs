#!/usr/bin/env node

// Generate capability tables from the catalogs used by providers.
// --check verifies the checked-in docs without writing files or building packages.
import { readFile, writeFile } from 'node:fs/promises';
import { loadCatalog } from './model-capabilities-docs/load-catalog.mjs';
import { providers } from './model-capabilities-docs/providers.mjs';
import {
  renderCapabilityTable,
  replaceGeneratedTable,
} from './model-capabilities-docs/render-tables.mjs';

const repoRoot = new URL('../', import.meta.url);
const check = process.argv.includes('--check');
const unexpectedArguments = process.argv
  .slice(2)
  .filter(arg => arg !== '--check');
if (unexpectedArguments.length > 0) {
  throw new Error(`Unknown arguments: ${unexpectedArguments.join(', ')}`);
}

// Finish generating and validating every provider document before writing files.
const providerDocs = await Promise.all(providers.map(generateProviderDocs));
const updates = providerDocs.filter(({ source, content }) => source !== content);

for (const { path, content } of updates) {
  if (check) {
    console.error(`Outdated model capabilities: ${path}`);
  } else {
    await writeFile(new URL(path, repoRoot), content);
    console.log(`Updated ${path}`);
  }
}

if (check && updates.length > 0) {
  console.error(
    'Run pnpm generate:model-capabilities-docs to update these tables.',
  );
  process.exitCode = 1;
} else {
  console.log('Model capability documentation is up to date.');
}

async function generateProviderDocs({
  catalogPath,
  catalogExport,
  docsPath,
  tables,
}) {
  const [module, source] = await Promise.all([
    loadCatalog(new URL(catalogPath, repoRoot)),
    readFile(new URL(docsPath, repoRoot), 'utf8'),
  ]);
  const catalog = module[catalogExport];
  if (catalog == null) {
    throw new Error(
      `Missing catalog export ${catalogExport} in ${catalogPath}`,
    );
  }
  const entries = Object.entries(catalog);
  let content = source;
  for (const table of tables) {
    content = replaceGeneratedTable(
      content,
      table.id,
      renderCapabilityTable(entries, table),
    );
  }
  return { path: docsPath, source, content };
}
