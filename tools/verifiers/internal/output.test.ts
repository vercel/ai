import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { fileURLToPath } from 'node:url';
import { logError, logMessage } from '../utils.ts';
import { readTextFile } from './file.ts';
import { outputErrorLog } from './output.ts';

const defaultGuidelineSource = await readTextFile(
  '.agents/guidelines/package-readme.md',
);

for (const quiet of [undefined, '', 'false', '1', 'TRUE', 'true']) {
  test(`logging suppresses only messages when QUIET=${JSON.stringify(quiet)}`, context => {
    const originalQuiet = process.env.QUIET;
    context.after(() => {
      if (originalQuiet == null) delete process.env.QUIET;
      else process.env.QUIET = originalQuiet;
    });
    if (quiet == null) delete process.env.QUIET;
    else process.env.QUIET = quiet;

    const messageLog = context.mock.method(console, 'log', () => {});
    const errorLog = context.mock.method(console, 'error', () => {});
    const error = new Error('Verification failed');

    logMessage('Verification complete');
    logError(error);

    assert.equal(messageLog.mock.callCount(), quiet === 'true' ? 0 : 1);
    if (quiet !== 'true') {
      assert.deepEqual(messageLog.mock.calls[0].arguments, [
        'Verification complete',
      ]);
    }
    assert.equal(errorLog.mock.callCount(), 1);
    assert.deepEqual(errorLog.mock.calls[0].arguments, [error]);
  });
}

for (const { name, error } of [
  {
    name: 'Error instances with a cause',
    error: new Error('Verification failed', { cause: new Error('Root cause') }),
  },
  { name: 'strings', error: 'Verification failed' },
  { name: 'objects', error: { message: 'Verification failed', code: 42 } },
  { name: 'numbers', error: 42 },
  { name: 'null', error: null },
  { name: 'undefined', error: undefined },
]) {
  test(`prints ${name} with an error marker`, async context => {
    const log = context.mock.method(console, 'error', () => {});

    await outputErrorLog('.agents/guidelines/package-readme.md', error);

    assert.equal(log.mock.callCount(), 2);
    assert.deepEqual(log.mock.calls[0].arguments, [
      '✖ Package README Guidelines:',
    ]);
    assert.deepEqual(log.mock.calls[1].arguments, ['  ERROR:', error]);
  });
}

const validReadme = `# AI SDK - Example Provider

The example provider supports language models.

## Setup

\`\`\`sh
npm i @ai-sdk/example
\`\`\`

## Usage

\`\`\`ts
import { example } from '@ai-sdk/example';
\`\`\`

See the [documentation](https://ai-sdk.dev/providers/ai-sdk-providers/example).
`;

function createFixture({
  context,
  guidelineSource = defaultGuidelineSource,
  readmes = {},
}: {
  context: TestContext;
  guidelineSource?: string;
  readmes?: Record<string, string>;
}) {
  const root = mkdtempSync(join(tmpdir(), 'verifier-output-'));
  context.after(() => rmSync(root, { recursive: true, force: true }));

  for (const path of [
    '.agents/guidelines',
    '.agents/verifiers',
    'tools/verifiers/internal',
    'packages',
  ]) {
    mkdirSync(join(root, path), { recursive: true });
  }

  for (const path of [
    '.agents/verifiers/package-readme.ts',
    '.agents/verifiers/package.json',
    'tools/verifiers/api.ts',
    'tools/verifiers/internal/input.ts',
    'tools/verifiers/internal/file.ts',
    'tools/verifiers/internal/guideline.ts',
    'tools/verifiers/internal/output.ts',
    'tools/verifiers/utils.ts',
    'tools/verifiers/package.json',
  ]) {
    copyFileSync(
      new URL(`../../../${path}`, import.meta.url),
      join(root, path),
    );
  }
  symlinkSync(
    fileURLToPath(new URL('../node_modules', import.meta.url)),
    join(root, 'tools/verifiers/node_modules'),
    'dir',
  );

  writeFileSync(
    join(root, '.agents/guidelines/package-readme.md'),
    guidelineSource,
  );
  for (const [file, source] of Object.entries(readmes)) {
    const path = join(root, file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, source);
  }

  return {
    verifierPath: join(root, '.agents/verifiers/package-readme.ts'),
    outputUrl: new URL(`file://${root}/tools/verifiers/internal/output.ts`)
      .href,
  };
}

test('reports success using the guideline H1 without warnings', context => {
  const { verifierPath } = createFixture({
    context,
    readmes: { 'packages/example/README.md': validReadme },
  });
  const result = spawnSync(process.execPath, [verifierPath], {
    cwd: tmpdir(),
    encoding: 'utf8',
  });

  assert.equal(result.status, 0);
  assert.equal(result.stdout, '✓ Package README Guidelines\n');
  assert.equal(result.stderr, '');
});

test('suppresses verifier success output when QUIET=true', context => {
  const { verifierPath } = createFixture({
    context,
    readmes: { 'packages/example/README.md': validReadme },
  });
  const result = spawnSync(process.execPath, [verifierPath], {
    encoding: 'utf8',
    env: { ...process.env, QUIET: 'true' },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
});

test('preserves verifier violations and exit code 2 when QUIET=true', context => {
  const { verifierPath } = createFixture({
    context,
    readmes: {
      'packages/example/README.md': validReadme.replace(
        '# AI SDK - Example Provider',
        '# Example Provider',
      ),
    },
  });
  const result = spawnSync(process.execPath, [verifierPath], {
    encoding: 'utf8',
    env: { ...process.env, QUIET: 'true' },
  });

  assert.equal(result.status, 2, result.stderr);
  assert.equal(result.stdout, '');
  assert.equal(
    result.stderr,
    '✖ Package README Guidelines (see `.agents/guidelines/package-readme.md`):\n' +
      '  - packages/example/README.md: violates `README-1`\n',
  );
});

test('preserves verifier errors and exit code 1 when QUIET=true', context => {
  const { verifierPath } = createFixture({ context });
  const result = spawnSync(
    process.execPath,
    [verifierPath, '--file', 'packages/missing/README.md'],
    { encoding: 'utf8', env: { ...process.env, QUIET: 'true' } },
  );

  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /ERROR:/);
  assert.match(result.stderr, /ENOENT/);
});

test('reports violated guideline IDs grouped by file', context => {
  const { verifierPath } = createFixture({
    context,
    readmes: {
      'packages/anthropic/README.md': validReadme.replace(
        '# AI SDK - Example Provider',
        '# Example Provider',
      ),
      'packages/google/README.md': validReadme
        .replace(
          'The example provider supports language models.',
          'First sentence. Second sentence. Third sentence.',
        )
        .replace('npm i @ai-sdk/example', 'pnpm add @ai-sdk/example')
        .replace('```ts', '```js'),
    },
  });
  const result = spawnSync(process.execPath, [verifierPath], {
    cwd: tmpdir(),
    encoding: 'utf8',
  });

  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  assert.equal(
    result.stderr,
    '✖ Package README Guidelines (see `.agents/guidelines/package-readme.md`):\n' +
      '  - packages/anthropic/README.md: violates `README-1`\n' +
      '  - packages/google/README.md: violates `README-2`, `README-3`\n',
  );
});

test('merges repeated files and deduplicates guideline IDs', context => {
  const { verifierPath, outputUrl } = createFixture({ context });
  const result = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      `import { outputViolationsLog } from ${JSON.stringify(outputUrl)};
       process.argv[1] = ${JSON.stringify(verifierPath)};
       await outputViolationsLog('.agents/guidelines/package-readme.md', [
         { file: 'packages/example/README.md', violationCodes: ['README-2'] },
         { file: 'packages/example/README.md', violationCodes: ['README-2', 'README-3'] },
       ]);`,
    ],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.equal(
    result.stderr,
    '✖ Package README Guidelines (see `.agents/guidelines/package-readme.md`):\n' +
      '  - packages/example/README.md: violates `README-2`, `README-3`\n',
  );
});

test('reads the actual H1 rather than headings in fenced examples', context => {
  const { verifierPath } = createFixture({
    context,
    guidelineSource:
      '---\r\nfileMatcher: []\r\n---\r\n\r\n' +
      '````md\r\n# Example heading\r\n```\r\n````\r\n' +
      '~~~md\r\n# Another example\r\n~~~\r\n' +
      '# Custom Guidelines ###\r\n',
  });
  const result = spawnSync(process.execPath, [verifierPath], {
    encoding: 'utf8',
  });

  assert.equal(result.status, 0);
  assert.equal(result.stdout, '✓ Custom Guidelines\n');
  assert.equal(result.stderr, '');
});

test('fails when the guideline file has no H1', context => {
  const { verifierPath } = createFixture({
    context,
    guidelineSource: '## Not an H1\n',
  });
  const result = spawnSync(process.execPath, [verifierPath], {
    encoding: 'utf8',
  });

  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(
    result.stderr,
    /No H1 heading found in guideline file "package-readme\.md"/,
  );
});
