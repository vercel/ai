import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { pathToFileURL } from 'node:url';
import { type fileExists, readTextFile } from './file.ts';

function createFixture({
  context,
  files = {},
}: {
  context: TestContext;
  files?: Record<string, string>;
}) {
  const root = mkdtempSync(join(tmpdir(), 'verifier-file-'));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'tools/verifiers/internal'), { recursive: true });
  copyFileSync(
    new URL('file.ts', import.meta.url),
    join(root, 'tools/verifiers/internal/file.ts'),
  );
  copyFileSync(
    new URL('../package.json', import.meta.url),
    join(root, 'tools/verifiers/package.json'),
  );
  copyFileSync(
    new URL('../utils.ts', import.meta.url),
    join(root, 'tools/verifiers/utils.ts'),
  );

  for (const [file, contents] of Object.entries(files)) {
    const path = join(root, file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents);
  }

  return {
    root,
    moduleUrl: pathToFileURL(join(root, 'tools/verifiers/internal/file.ts'))
      .href,
  };
}

test('returns the full UTF-8 contents of a repo-relative file', async () => {
  const source = await readTextFile('tools/verifiers/internal/file.ts');

  assert.equal(
    source,
    readFileSync(new URL('file.ts', import.meta.url), 'utf8'),
  );
});

test('fileExists is exported from utils and returns true for an existing file', async context => {
  const { root } = createFixture({
    context,
    files: { 'fixtures/with spaces/[example].txt': '' },
  });
  const utils: { fileExists: typeof fileExists } = await import(
    pathToFileURL(join(root, 'tools/verifiers/utils.ts')).href
  );

  assert.equal(
    await utils.fileExists('fixtures/with spaces/[example].txt'),
    true,
  );
});

test('fileExists returns false for missing files and directories', async context => {
  const { moduleUrl } = createFixture({
    context,
    files: { 'fixtures/existing.txt': '' },
  });
  const fileModule: { fileExists: typeof fileExists } = await import(moduleUrl);

  assert.equal(await fileModule.fileExists('missing.txt'), false);
  assert.equal(await fileModule.fileExists('fixtures'), false);
  assert.equal(
    await fileModule.fileExists('fixtures/existing.txt/child.txt'),
    false,
  );
});

test('fileExists resolves repo-relative paths independently of the working directory', context => {
  const { moduleUrl } = createFixture({
    context,
    files: { '.agents/guidelines/example.md': '# Example Guidelines\n' },
  });
  const result = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      `import { fileExists } from ${JSON.stringify(moduleUrl)};
       console.log(await fileExists('.agents/guidelines/example.md'));`,
    ],
    { cwd: tmpdir(), encoding: 'utf8' },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, 'true\n');
  assert.equal(result.stderr, '');
});

test('preserves line endings, Unicode, whitespace, and special path characters', async context => {
  const contents = 'First line\r\n\r\n  café ✓\t\r\n';
  const { moduleUrl } = createFixture({
    context,
    files: { 'fixtures/with spaces/#readme%20.md': contents },
  });
  const fileModule: { readTextFile: typeof readTextFile } = await import(
    moduleUrl
  );

  assert.equal(
    await fileModule.readTextFile('fixtures/with spaces/#readme%20.md'),
    contents,
  );
});

test('returns an empty string for an empty file', async context => {
  const { moduleUrl } = createFixture({
    context,
    files: { 'empty.txt': '' },
  });
  const fileModule: { readTextFile: typeof readTextFile } = await import(
    moduleUrl
  );

  assert.equal(await fileModule.readTextFile('empty.txt'), '');
});

test('rejects when the file does not exist', async context => {
  const { moduleUrl } = createFixture({ context });
  const fileModule: { readTextFile: typeof readTextFile } = await import(
    moduleUrl
  );

  await assert.rejects(fileModule.readTextFile('missing.txt'), {
    code: 'ENOENT',
  });
});

test('resolves paths from the repo root independently of the working directory', context => {
  const { moduleUrl } = createFixture({
    context,
    files: { '.agents/guidelines/example.md': '# Example Guidelines\n' },
  });
  const result = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      `import { readTextFile } from ${JSON.stringify(moduleUrl)};
       process.stdout.write(await readTextFile('.agents/guidelines/example.md'));`,
    ],
    { cwd: tmpdir(), encoding: 'utf8' },
  );

  assert.equal(result.status, 0);
  assert.equal(result.stdout, '# Example Guidelines\n');
  assert.equal(result.stderr, '');
});

test('splits TypeScript references using the shared reader', context => {
  const { root } = createFixture({
    context,
    files: {
      'tsconfig.json': JSON.stringify({
        references: [
          { path: 'packages/example' },
          { path: 'examples/example' },
          { path: 'tools/verifiers' },
        ],
      }),
      'tsconfig.with-examples.json': '{}',
    },
  });
  copyFileSync(
    new URL('../../split-ts-references.mjs', import.meta.url),
    join(root, 'tools/split-ts-references.mjs'),
  );
  const result = spawnSync(
    process.execPath,
    ['tools/split-ts-references.mjs'],
    {
      cwd: root,
      encoding: 'utf8',
    },
  );

  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  assert.equal(
    readFileSync(join(root, 'tsconfig.json'), 'utf8'),
    JSON.stringify({ references: [{ path: 'packages/example' }] }, null, 2) +
      '\n',
  );
  assert.equal(
    readFileSync(join(root, 'tsconfig.with-examples.json'), 'utf8'),
    JSON.stringify(
      { references: [{ path: './' }, { path: 'examples/example' }] },
      null,
      2,
    ) + '\n',
  );
});
