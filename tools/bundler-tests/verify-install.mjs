import assert from 'node:assert/strict';
import { readFile, realpath } from 'node:fs/promises';
import { dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// The runner copies this script into the consumer before executing it, so Node
// resolves these imports from the isolated install rather than the repository.
const consumer = await realpath(dirname(fileURLToPath(import.meta.url)));
for (const name of process.argv.slice(2)) {
  const entry = await realpath(fileURLToPath(import.meta.resolve(name)));
  assert(
    entry.startsWith(consumer + sep),
    `${name} resolved outside the consumer: ${entry}`,
  );
  assert(
    entry.includes(`${sep}dist${sep}`),
    `${name} did not resolve to built output`,
  );
  const manifest = JSON.parse(
    await readFile(new URL(import.meta.resolve(`${name}/package.json`)), 'utf8'),
  );
  console.log(`Installed ${name}@${manifest.version}: ${entry}`);
}
