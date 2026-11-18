import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { getGuidelineFile, getVerifierFile } from '../utils.ts';
import { getInputFiles } from './input.ts';

function setArgv({
  context,
  verifier = '.agents/verifiers/package-readme.ts',
  args = [],
}: {
  context: TestContext;
  verifier?: string;
  args?: string[];
}) {
  const originalArgv = process.argv;
  context.after(() => {
    process.argv = originalArgv;
  });
  process.argv = [process.execPath, verifier, ...args];
}

test('returns repo-relative paths based on a relative verifier path', context => {
  setArgv({ context });

  assert.equal(getGuidelineFile(), '.agents/guidelines/package-readme.md');
  assert.equal(getVerifierFile(), '.agents/verifiers/package-readme.md');
});

test('returns repo-relative paths based on an absolute verifier path', context => {
  setArgv({
    context,
    verifier: '/repo/.agents/verifiers/provider-options.ts',
    args: ['--file', 'packages/example/README.md'],
  });

  assert.equal(getGuidelineFile(), '.agents/guidelines/provider-options.md');
  assert.equal(getVerifierFile(), '.agents/verifiers/provider-options.md');
});

test('strips only the final extension from the verifier name', context => {
  setArgv({ context, verifier: '.agents/verifiers/example.test.ts' });

  assert.equal(getGuidelineFile(), '.agents/guidelines/example.test.md');
  assert.equal(getVerifierFile(), '.agents/verifiers/example.test.md');
});

test('rejects missing executable verifier paths', context => {
  setArgv({ context });
  process.argv = [process.execPath];

  assert.throws(getGuidelineFile, {
    message: 'Cannot determine the executable verifier file.',
  });
  assert.throws(getVerifierFile, {
    message: 'Cannot determine the executable verifier file.',
  });
});

test('returns an empty list when there are no file flags', context => {
  setArgv({ context });

  assert.deepEqual(getInputFiles(), []);
});

test('returns a single file path unchanged', context => {
  setArgv({ context, args: ['--file', 'packages/harness/README.md'] });

  assert.deepEqual(getInputFiles(), ['packages/harness/README.md']);
});

test('preserves the order and duplicates of repeated file flags', context => {
  setArgv({
    context,
    args: [
      '--file',
      'packages/google/README.md',
      '--file',
      'packages/anthropic/README.md',
      '--file',
      'packages/google/README.md',
    ],
  });

  assert.deepEqual(getInputFiles(), [
    'packages/google/README.md',
    'packages/anthropic/README.md',
    'packages/google/README.md',
  ]);
});

test('preserves spaces and special characters in file paths', context => {
  setArgv({ context, args: ['--file', 'examples/my app/[id]/page.tsx'] });

  assert.deepEqual(getInputFiles(), ['examples/my app/[id]/page.tsx']);
});

test('rejects positional arguments', context => {
  setArgv({
    context,
    args: ['other', '--file', 'packages/harness/README.md'],
  });

  assert.throws(getInputFiles, {
    code: 'ERR_PARSE_ARGS_UNEXPECTED_POSITIONAL',
  });
});

test('rejects positional arguments after the end-of-options marker', context => {
  setArgv({ context, args: ['--', '--file', 'packages/harness/README.md'] });

  assert.throws(getInputFiles, {
    code: 'ERR_PARSE_ARGS_UNEXPECTED_POSITIONAL',
  });
});

test('rejects a file flag without a value', context => {
  setArgv({ context, args: ['--file'] });

  assert.throws(getInputFiles, { code: 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE' });
});
