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

const validReadme = `# AI SDK - Example Provider

The Example provider integrates with the AI SDK.

## Setup

\`\`\`bash
npm i @ai-sdk/example
\`\`\`

## Usage

\`\`\`ts
import { example } from '@ai-sdk/example';
\`\`\`

See the [Example documentation](https://ai-sdk.dev/providers/ai-sdk-providers/example) for more information.
`;

function runFixture({
  context,
  files,
  args = [],
}: {
  context: TestContext;
  files: Record<string, string>;
  args?: string[];
}) {
  const root = mkdtempSync(join(tmpdir(), 'package-readme-verifier-'));
  context.after(() => rmSync(root, { recursive: true, force: true }));

  for (const file of [
    '.agents/guidelines/package-readme.md',
    '.agents/verifiers/package-readme.ts',
    '.agents/verifiers/package.json',
    'tools/verifiers/api.ts',
    'tools/verifiers/internal/file.ts',
    'tools/verifiers/internal/guideline.ts',
    'tools/verifiers/internal/input.ts',
    'tools/verifiers/internal/output.ts',
    'tools/verifiers/utils.ts',
    'tools/verifiers/package.json',
  ]) {
    const target = join(root, file);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(new URL(`../../${file}`, import.meta.url), target);
  }
  symlinkSync(
    fileURLToPath(new URL('node_modules', import.meta.url)),
    join(root, 'tools/verifiers/node_modules'),
    'dir',
  );

  for (const [file, contents] of Object.entries(files)) {
    const target = join(root, file);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, contents);
  }

  return spawnSync(
    process.execPath,
    [join(root, '.agents/verifiers/package-readme.ts'), ...args],
    { cwd: tmpdir(), encoding: 'utf8' },
  );
}

test('README verifier discovers files using guideline globs and exclusions', context => {
  const result = runFixture({
    context,
    files: {
      'packages/example/README.md': validReadme,
      'packages/ai/README.md': 'Invalid excluded README',
      'packages/codemod/README.md': 'Invalid excluded README',
      'packages/provider/README.md': 'Invalid excluded README',
      'packages/provider-utils/README.md': 'Invalid excluded README',
    },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '✓ Package README Guidelines\n');
  assert.equal(result.stderr, '');
});

test('README verifier checks only explicitly requested files', context => {
  const result = runFixture({
    context,
    files: {
      'packages/example/README.md': validReadme,
      'packages/other/README.md': 'Invalid unrequested README',
    },
    args: ['--file', 'packages/example/README.md'],
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '✓ Package README Guidelines\n');
  assert.equal(result.stderr, '');
});

test('README verifier reports every violated guideline through runVerifier with exit code 2', context => {
  const result = runFixture({
    context,
    files: {
      'packages/headline/README.md': validReadme.replace('# AI SDK - ', '# '),
      'packages/description/README.md': validReadme.replace(
        'The Example provider integrates with the AI SDK.',
        'First sentence. Second sentence. Third sentence.',
      ),
      'packages/sections/README.md': validReadme.replace(
        '## Usage',
        '## Extra\n\n## Usage',
      ),
    },
  });

  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  assert.equal(
    result.stderr,
    '✖ Package README Guidelines (see `.agents/guidelines/package-readme.md`):\n' +
      '  - packages/description/README.md: violates `README-2`\n' +
      '  - packages/headline/README.md: violates `README-1`\n' +
      '  - packages/sections/README.md: violates `README-3`\n',
  );
});

test('README verifier reports multiple violations for a file without duplicate codes in the output', context => {
  const result = runFixture({
    context,
    files: {
      'packages/example/README.md': validReadme
        .replace('# AI SDK - ', '# ')
        .replace('npm i @ai-sdk/example', 'invalid setup command')
        .replace('```bash', '```text')
        .replace('```ts', '```text'),
    },
  });

  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  assert.equal(
    result.stderr,
    '✖ Package README Guidelines (see `.agents/guidelines/package-readme.md`):\n' +
      '  - packages/example/README.md: violates `README-1`, `README-3`\n',
  );
});

test('README verifier reports file read errors with exit code 1', context => {
  const result = runFixture({
    context,
    files: {},
    args: ['--file', 'packages/missing/README.md'],
  });

  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /^✖ Package README Guidelines:\n {2}ERROR:/);
  assert.match(result.stderr, /ENOENT/);
});
