import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { getApplicableGuidelines, getInputFiles } from './discovery.ts';

async function createFixture({
  context,
  args = [],
}: {
  context: TestContext;
  args?: string[];
}) {
  const root = mkdtempSync(join(tmpdir(), 'guideline-discovery-'));
  const originalArgv = process.argv;
  context.after(() => {
    process.argv = originalArgv;
    rmSync(root, { recursive: true, force: true });
  });
  process.argv = [
    process.execPath,
    join(root, 'tools/discover-guidelines.mts'),
    ...args,
  ];

  for (const name of [
    'discovery.ts',
    'file.ts',
    'guideline.ts',
    '../package.json',
  ]) {
    const target = join(root, 'tools/verifiers/internal', name);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(new URL(name, import.meta.url), target);
  }
  symlinkSync(
    fileURLToPath(new URL('../node_modules', import.meta.url)),
    join(root, 'tools/verifiers/node_modules'),
    'dir',
  );
  for (const [file, source] of Object.entries({
    '.agents/guidelines/readme.md':
      "---\nfileMatcher: ['packages/*/README.md', '!packages/excluded/**']\n---\n# README Guidelines\n",
    '.agents/guidelines/typescript.md':
      "---\nfileMatcher: ['packages/**/*.ts']\n---\n# TypeScript Guidelines\n",
    '.agents/guidelines/_TEMPLATE.md':
      'Invalid template frontmatter is ignored',
    'packages/example/README.md': 'Example',
    'packages/example/src/index.ts': '',
    'packages/excluded/README.md': 'Excluded',
    'unrelated.txt': '',
  })) {
    const target = join(root, file);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, source);
  }

  const discovery: {
    getApplicableGuidelines: typeof getApplicableGuidelines;
    getInputFiles: typeof getInputFiles;
  } = await import(
    pathToFileURL(join(root, 'tools/verifiers/internal/discovery.ts')).href
  );
  return { root, ...discovery };
}

test('discovers guidelines and their individual files from variadic globs and directory prefixes', async context => {
  const { getApplicableGuidelines, getInputFiles } = await createFixture({
    context,
    args: ['--paths', 'packages/**/README.md', 'packages/example/src'],
  });

  const files = getInputFiles();
  assert.deepEqual([...files].sort(), [
    'packages/example/README.md',
    'packages/example/src/index.ts',
    'packages/excluded/README.md',
  ]);
  assert.deepEqual(await getApplicableGuidelines(files), [
    {
      guidelineFile: '.agents/guidelines/readme.md',
      files: ['packages/example/README.md'],
    },
    {
      guidelineFile: '.agents/guidelines/typescript.md',
      files: ['packages/example/src/index.ts'],
    },
  ]);
});

test('repeated paths are deduplicated and override staged discovery', async context => {
  const { getInputFiles } = await createFixture({
    context,
    args: [
      '--staged',
      '--paths',
      'packages/example/README.md',
      '--paths',
      'packages/example/README.md',
    ],
  });
  const git = context.mock.method(childProcess, 'execFileSync', () => {
    throw new Error('Git must not be invoked');
  });
  syncBuiltinESMExports();
  try {
    assert.deepEqual(getInputFiles(), ['packages/example/README.md']);
  } finally {
    git.mock.restore();
    syncBuiltinESMExports();
  }
});

test('file discovery skips dangling symlinks', async context => {
  const { root, getInputFiles } = await createFixture({
    context,
    args: ['--paths', 'packages/example/src'],
  });
  symlinkSync('missing.ts', join(root, 'packages/example/src/dangling.ts'));

  assert.deepEqual(getInputFiles(), ['packages/example/src/index.ts']);
});

test('file discovery uses default paths when neither input flag is provided', async context => {
  const { getInputFiles } = await createFixture({ context });

  assert.deepEqual(getInputFiles({ defaultPaths: ['packages/example/src'] }), [
    'packages/example/src/index.ts',
  ]);
});

test('explicit paths do not fall back to defaults when no files match', async context => {
  const { getInputFiles } = await createFixture({
    context,
    args: ['--paths', 'missing-directory'],
  });

  assert.deepEqual(
    getInputFiles({ defaultPaths: ['packages/example/src'] }),
    [],
  );
});

test('staged discovery does not fall back to default paths when the index is empty', async context => {
  const { getInputFiles } = await createFixture({
    context,
    args: ['--staged'],
  });
  const git = context.mock.method(childProcess, 'execFileSync', () => '');
  syncBuiltinESMExports();
  try {
    assert.deepEqual(getInputFiles(), []);
    assert.deepEqual(
      getInputFiles({ defaultPaths: ['packages/example/src'] }),
      [],
    );
    assert.equal(git.mock.callCount(), 2);
  } finally {
    git.mock.restore();
    syncBuiltinESMExports();
  }
});

test('staged discovery preserves deleted paths and filenames containing spaces', async context => {
  const { root, getInputFiles } = await createFixture({
    context,
    args: ['--staged'],
  });
  const git = context.mock.method(
    childProcess,
    'execFileSync',
    (...[command, args, options]: [string, string[], { cwd: string }]) => {
      assert.equal(command, 'git');
      assert.deepEqual(args, ['diff', '--staged', '--name-only', '-z']);
      assert.equal(realpathSync(options.cwd), realpathSync(root));
      return 'packages/deleted/README.md\0packages/with spaces/README.md\0';
    },
  );
  syncBuiltinESMExports();
  try {
    assert.deepEqual(getInputFiles(), [
      'packages/deleted/README.md',
      'packages/with spaces/README.md',
    ]);
  } finally {
    git.mock.restore();
    syncBuiltinESMExports();
  }
});

for (const args of [
  ['--paths', 'unrelated.txt'],
  ['--paths', 'packages/excluded/README.md'],
  ['--paths', 'missing-directory'],
]) {
  test(`returns no applicable guidelines for ${JSON.stringify(args)}`, async context => {
    const { getApplicableGuidelines, getInputFiles } = await createFixture({
      context,
      args,
    });

    assert.deepEqual(await getApplicableGuidelines(getInputFiles()), []);
  });
}

for (const args of [
  [],
  ['--paths', '/tmp'],
  ['--paths', '../outside'],
  ['--paths'],
  ['unexpected'],
  ['--unknown'],
]) {
  test(`rejects invalid discovery arguments ${JSON.stringify(args)}`, async context => {
    const { getInputFiles } = await createFixture({ context, args });

    assert.throws(getInputFiles);
  });
}

test('matches explicitly supplied files independently of input arguments and file existence', async context => {
  const { getApplicableGuidelines } = await createFixture({
    context,
    args: ['--unknown'],
  });

  assert.deepEqual(
    await getApplicableGuidelines([
      'packages/deleted/README.md',
      'packages/excluded/README.md',
      'packages/deleted/src/index.ts',
    ]),
    [
      {
        guidelineFile: '.agents/guidelines/readme.md',
        files: ['packages/deleted/README.md'],
      },
      {
        guidelineFile: '.agents/guidelines/typescript.md',
        files: ['packages/deleted/src/index.ts'],
      },
    ],
  );
});
