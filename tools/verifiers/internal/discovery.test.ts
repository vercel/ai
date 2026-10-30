import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import fs, {
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
    'output.ts',
    '../package.json',
    '../utils.ts',
    '../../discover-guidelines.mts',
    '../../run-verifiers.mts',
    '../../../.agents/verifiers/package.json',
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
  return {
    root,
    ...discovery,
    runCli({
      script,
      args = [],
      env = {},
    }: {
      script: 'discover-guidelines' | 'run-verifiers';
      args?: string[];
      env?: NodeJS.ProcessEnv;
    }) {
      return childProcess.spawnSync(
        process.execPath,
        [join(root, `tools/${script}.mts`), ...args],
        { cwd: tmpdir(), encoding: 'utf8', env: { ...process.env, ...env } },
      );
    },
  };
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

test('repeated and variadic paths are deduplicated without invoking Git', async context => {
  const { getInputFiles } = await createFixture({
    context,
    args: [
      '--paths',
      'packages/example/README.md',
      'packages/example/src',
      '--paths',
      'packages/example/README.md',
    ],
  });
  const git = context.mock.method(childProcess, 'execFileSync', () => {
    throw new Error('Git must not be invoked');
  });
  syncBuiltinESMExports();
  try {
    assert.deepEqual(getInputFiles(), [
      'packages/example/README.md',
      'packages/example/src/index.ts',
    ]);
    assert.equal(git.mock.callCount(), 0);
  } finally {
    git.mock.restore();
    syncBuiltinESMExports();
  }
});

for (const args of [
  ['--paths', 'packages', '--staged'],
  ['--staged', '--paths', 'packages'],
  ['--paths', 'packages', '--modified'],
  ['--modified', '--paths', 'packages'],
  ['--staged', '--modified'],
  ['--modified', '--staged'],
  ['--paths', 'packages', '--staged', '--modified'],
]) {
  test(`rejects mixed selection flags before discovery ${JSON.stringify(args)}`, async context => {
    const { getInputFiles, runCli } = await createFixture({ context, args });
    const git = context.mock.method(childProcess, 'execFileSync', () => {
      throw new Error('Git must not be invoked');
    });
    const glob = context.mock.method(fs, 'globSync', () => {
      throw new Error('Globs must not be expanded');
    });
    syncBuiltinESMExports();
    try {
      assert.throws(getInputFiles, {
        message: 'Use only one of --paths, --staged, or --modified.',
      });
      assert.equal(git.mock.callCount(), 0);
      assert.equal(glob.mock.callCount(), 0);
      for (const script of ['discover-guidelines', 'run-verifiers'] as const) {
        const result = runCli({ script, args });
        assert.equal(result.status, 1, result.stderr);
        assert.equal(result.stdout, '');
        assert.match(
          result.stderr,
          /Use only one of --paths, --staged, or --modified\./,
        );
      }
    } finally {
      git.mock.restore();
      glob.mock.restore();
      syncBuiltinESMExports();
    }
  });
}

for (const flag of ['--staged', '--modified']) {
  test(`rejects repeated ${flag} flags`, async context => {
    const args = [flag, flag];
    const { getInputFiles, runCli } = await createFixture({ context, args });

    assert.throws(getInputFiles, {
      message: `${flag} may only be provided once.`,
    });
    for (const script of ['discover-guidelines', 'run-verifiers'] as const) {
      const result = runCli({ script, args });
      assert.equal(result.status, 1, result.stderr);
      assert.equal(result.stdout, '');
      assert.ok(result.stderr.includes(`${flag} may only be provided once.`));
    }
  });
}

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

test('modified discovery combines staged, unstaged, and untracked paths without duplicates', async context => {
  const { root, getInputFiles } = await createFixture({
    context,
    args: ['--modified'],
  });
  const commands = [
    ['diff', '--staged', '--name-only', '-z'],
    ['diff', '--name-only', '-z'],
    ['ls-files', '--others', '--exclude-standard', '-z'],
  ];
  const staged = [
    'packages/staged/README.md',
    'packages/both/README.md',
    'packages/deleted/README.md',
    'packages/renamed/README.md',
    'packages/ignored-but-tracked/README.md',
  ];
  const unstaged = [
    'packages/unstaged/README.md',
    'packages/both/README.md',
    'packages/with spaces/README.md',
    'packages/tab\tand\nnewline/日本語.ts',
  ];
  const untracked = ['packages/new/README.md', 'packages/new/src/index.ts'];
  const outputs = [staged, unstaged, untracked];
  let commandIndex = 0;
  const git = context.mock.method(
    childProcess,
    'execFileSync',
    (
      ...[command, args, options]: [
        string,
        string[],
        { cwd: string; encoding: string },
      ]
    ) => {
      assert.equal(command, 'git');
      assert.deepEqual(args, commands[commandIndex]);
      assert.equal(realpathSync(options.cwd), realpathSync(root));
      assert.equal(options.encoding, 'utf8');
      return `${outputs[commandIndex++].join('\0')}\0`;
    },
  );
  syncBuiltinESMExports();
  try {
    assert.deepEqual(getInputFiles(), [
      ...staged,
      'packages/unstaged/README.md',
      'packages/with spaces/README.md',
      'packages/tab\tand\nnewline/日本語.ts',
      ...untracked,
    ]);
    assert.equal(git.mock.callCount(), 3);
  } finally {
    git.mock.restore();
    syncBuiltinESMExports();
  }
});

test('modified discovery does not fall back to default paths when no changes exist', async context => {
  const { getInputFiles } = await createFixture({
    context,
    args: ['--modified'],
  });
  const git = context.mock.method(childProcess, 'execFileSync', () => '');
  syncBuiltinESMExports();
  try {
    assert.deepEqual(getInputFiles(), []);
    assert.deepEqual(
      getInputFiles({ defaultPaths: ['packages/example/src'] }),
      [],
    );
    assert.equal(git.mock.callCount(), 6);
  } finally {
    git.mock.restore();
    syncBuiltinESMExports();
  }
});

for (const failureIndex of [0, 1, 2]) {
  test(`modified discovery propagates failure of Git command ${failureIndex + 1}`, async context => {
    const { getInputFiles } = await createFixture({
      context,
      args: ['--modified'],
    });
    const error = new Error('Git failed');
    let commandIndex = 0;
    const git = context.mock.method(childProcess, 'execFileSync', () => {
      if (commandIndex++ === failureIndex) throw error;
      return '';
    });
    syncBuiltinESMExports();
    try {
      assert.throws(getInputFiles, actual => actual === error);
      assert.equal(git.mock.callCount(), failureIndex + 1);
    } finally {
      git.mock.restore();
      syncBuiltinESMExports();
    }
  });
}

test('both CLIs discover non-ignored untracked files using modified selection', async context => {
  const { root, runCli } = await createFixture({ context });
  childProcess.execFileSync('git', ['init', '--quiet', root]);
  writeFileSync(
    join(root, '.gitignore'),
    'packages/example/src/\npackages/ignored/\n',
  );
  for (const name of ['new with spaces', 'ignored']) {
    mkdirSync(join(root, `packages/${name}`), { recursive: true });
    writeFileSync(join(root, `packages/${name}/README.md`), 'Example');
  }
  writeFileSync(
    join(root, '.agents/verifiers/readme.ts'),
    '#!/usr/bin/env node\nconsole.log(JSON.stringify(process.argv.slice(2)));\n',
    { mode: 0o755 },
  );

  const discovery = runCli({
    script: 'discover-guidelines',
    args: ['--modified'],
  });
  assert.equal(discovery.status, 0, discovery.stderr);
  assert.equal(discovery.stderr, '');
  assert.equal(
    discovery.stdout,
    'Ensure you have read the following guidelines:\n' +
      '- `.agents/guidelines/readme.md`\n',
  );

  const verification = runCli({
    script: 'run-verifiers',
    args: ['--modified'],
  });
  assert.equal(verification.status, 0, verification.stderr);
  assert.equal(verification.stderr, '');
  assert.equal(
    verification.stdout,
    `Verifier results:\n${JSON.stringify([
      '--file',
      'packages/example/README.md',
      '--file',
      'packages/new with spaces/README.md',
    ])}\n`,
  );
});

test('both CLIs report no applicable results for an empty modified selection', async context => {
  const { root, runCli } = await createFixture({ context });
  childProcess.execFileSync('git', ['init', '--quiet', root]);
  writeFileSync(join(root, '.gitignore'), '*\n');

  for (const [script, subject] of [
    ['discover-guidelines', 'guidelines'],
    ['run-verifiers', 'verifiers'],
  ] as const) {
    const result = runCli({ script, args: ['--modified'] });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, '');
    assert.equal(result.stdout, `No applicable ${subject} found.\n`);
  }
});

for (const script of ['discover-guidelines', 'run-verifiers'] as const) {
  test(`${script} suppresses routine output when QUIET=true`, async context => {
    const { runCli } = await createFixture({ context });

    for (const path of ['unrelated.txt', 'packages/example/README.md']) {
      const result = runCli({
        script,
        args: ['--paths', path],
        env: { QUIET: 'true' },
      });

      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout, '');
      assert.equal(result.stderr, '');
    }
  });

  test(`${script} preserves errors when QUIET=true`, async context => {
    const { runCli } = await createFixture({ context });
    const result = runCli({
      script,
      args: ['--unknown'],
      env: { QUIET: 'true' },
    });

    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /Unknown option '--unknown'/);
  });
}

for (const exitCode of [0, 1, 2]) {
  test(`run-verifiers passes QUIET=true to child verifiers and preserves exit code ${exitCode}`, async context => {
    const { root, runCli } = await createFixture({ context });
    writeFileSync(
      join(root, '.agents/verifiers/readme.ts'),
      `#!/usr/bin/env node
import { logError, logMessage } from '../../tools/verifiers/utils.ts';
logMessage('Child verifier output');
if (${exitCode} !== 0) logError('Child verifier failure');
process.exitCode = ${exitCode};
`,
      { mode: 0o755 },
    );
    const result = runCli({
      script: 'run-verifiers',
      args: ['--paths', 'packages/example/README.md'],
      env: { QUIET: 'true' },
    });

    assert.equal(result.status, exitCode, result.stderr);
    assert.equal(result.stdout, '');
    assert.equal(
      result.stderr,
      exitCode === 0
        ? ''
        : 'Child verifier failure\n' +
            (exitCode === 2
              ? 'You must fix these violations. Refer to the referenced guideline files for more information.\n'
              : ''),
    );
  });
}

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
  ['--modified', 'unexpected'],
  ['--modified=false'],
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

test('missing input errors list all supported selection modes', async context => {
  const { getInputFiles } = await createFixture({ context });

  assert.throws(getInputFiles, {
    message: 'Pass --paths <path> ... or --staged or --modified.',
  });
});
