import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(
  new URL('./build-search-index.mjs', import.meta.url),
);
const mode = new URL('../lib/geistdocs/search-index-mode.mjs', import.meta.url);

const run = (args, VERCEL_ENV) => {
  const env = { ...process.env, VERCEL_ENV };
  if (VERCEL_ENV === undefined) {
    delete env.VERCEL_ENV;
  }
  return execFileSync(process.execPath, args, { env, encoding: 'utf8' });
};

test('only production deployments use the prebuilt search index', () => {
  const printMode = [
    '--input-type=module',
    '--eval',
    `import { hasPrebuiltSearchIndex } from ${JSON.stringify(mode.href)};
     console.log(hasPrebuiltSearchIndex);`,
  ];

  assert.equal(run(printMode, 'production').trim(), 'true');
  for (const VERCEL_ENV of ['preview', 'development', undefined]) {
    assert.equal(run(printMode, VERCEL_ENV).trim(), 'false');
  }
});

test('build-search-index builds nothing outside production deployments', () => {
  for (const VERCEL_ENV of ['preview', 'development', undefined]) {
    // The script would fail here if it went on: tests run without the
    // compiled source config it reads.
    assert.match(run([script], VERCEL_ENV), /skipped/);
  }
});
