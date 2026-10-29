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

const defaultGuidelineSource =
  '---\nfileMatcher: []\n---\n# Test Guidelines\n\n## TEST-1: First rule\n\n## TEST-2: Second rule\n';

function runFixture({
  context,
  callback,
  args = [],
  guidelineSource = defaultGuidelineSource,
  files = {},
}: {
  context: TestContext;
  callback: string;
  args?: string[];
  guidelineSource?: string | null;
  files?: Record<string, string>;
}) {
  const root = mkdtempSync(join(tmpdir(), 'verifier-api-'));
  context.after(() => rmSync(root, { recursive: true, force: true }));

  for (const path of [
    '.agents/guidelines',
    '.agents/verifiers',
    'tools/verifiers/internal',
  ]) {
    mkdirSync(join(root, path), { recursive: true });
  }

  for (const name of [
    'api.ts',
    'internal/input.ts',
    'internal/file.ts',
    'internal/output.ts',
    'utils.ts',
    'package.json',
  ]) {
    copyFileSync(
      new URL(name, import.meta.url),
      join(root, 'tools/verifiers', name),
    );
  }
  copyFileSync(
    new URL('../../.agents/verifiers/package.json', import.meta.url),
    join(root, '.agents/verifiers/package.json'),
  );
  symlinkSync(
    fileURLToPath(new URL('node_modules', import.meta.url)),
    join(root, 'tools/verifiers/node_modules'),
    'dir',
  );

  for (const [file, contents] of Object.entries(files)) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), contents);
  }

  if (guidelineSource != null) {
    writeFileSync(join(root, '.agents/guidelines/example.md'), guidelineSource);
  }
  const verifierPath = join(root, '.agents/verifiers/example.ts');
  writeFileSync(
    verifierPath,
    `import assert from 'node:assert/strict';
     import { runVerifier } from '../../tools/verifiers/api.ts';
     await runVerifier(async ({ files, reportViolation }) => {
       ${callback}
     });`,
  );

  return spawnSync(process.execPath, [verifierPath, ...args], {
    cwd: tmpdir(),
    encoding: 'utf8',
  });
}

test('passes an empty file list and exits with success when no violations are reported', context => {
  const result = runFixture({
    context,
    callback: 'assert.deepEqual(files, []); process.exitCode = 7;',
  });

  assert.equal(result.status, 0);
  assert.equal(result.stdout, '✓ Test Guidelines\n');
  assert.equal(result.stderr, '');
});

test('passes the file flags unchanged to the callback', context => {
  const result = runFixture({
    context,
    guidelineSource: defaultGuidelineSource.replace(
      'fileMatcher: []',
      "fileMatcher: ['packages/**', 'examples/**']",
    ),
    args: [
      '--file',
      'packages/harness/README.md',
      '--file',
      'examples/my app/[id]/page.tsx',
      '--file',
      'packages/harness/README.md',
    ],
    callback: `assert.deepEqual(files, [
      'packages/harness/README.md',
      'examples/my app/[id]/page.tsx',
      'packages/harness/README.md',
    ]);`,
  });

  assert.equal(result.status, 0);
  assert.equal(result.stdout, '✓ Test Guidelines\n');
  assert.equal(result.stderr, '');
});

test('awaits the callback and outputs grouped violations with exit code 2', context => {
  const result = runFixture({
    context,
    callback: `await new Promise(resolve => setImmediate(resolve));
      reportViolation({ file: 'packages/first/README.md', violationCode: 'TEST-1' });
      reportViolation({ file: 'packages/second/README.md', violationCode: 'TEST-2' });
      reportViolation({ file: 'packages/first/README.md', violationCode: 'TEST-2' });
      reportViolation({ file: 'packages/first/README.md', violationCode: 'TEST-1' });`,
  });

  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  assert.equal(
    result.stderr,
    '✖ Test Guidelines (see `.agents/guidelines/example.md`):\n' +
      '  - packages/first/README.md: violates `TEST-1`, `TEST-2`\n' +
      '  - packages/second/README.md: violates `TEST-2`\n',
  );
});

test('passes only unique per-file violation codes to the output function after the callback completes', context => {
  const result = runFixture({
    context,
    files: {
      'tools/verifiers/internal/output.ts': `
        import assert from 'node:assert/strict';
        export async function outputSuccessLog() {
          throw new Error('Unexpected success output');
        }
        export async function outputErrorLog(guidelineFile, error) {
          console.error(error);
        }
        export async function outputViolationsLog(guidelineFile, violations) {
          assert.equal(globalThis.callbackCompleted, true);
          console.log(JSON.stringify(violations));
        }
      `,
    },
    callback: `for (let index = 0; index < 1000; index++) {
        reportViolation({ file: 'first.md', violationCode: 'TEST-1' });
        reportViolation({ file: 'second.md', violationCode: 'TEST-1' });
        reportViolation({ file: 'first.md', violationCode: 'TEST-2' });
      }
      await new Promise(resolve => setImmediate(resolve));
      reportViolation({ file: 'first.md', violationCode: 'TEST-1' });
      globalThis.callbackCompleted = true;`,
  });

  assert.equal(result.status, 2, result.stderr);
  assert.equal(result.stderr, '');
  assert.equal(
    result.stdout,
    JSON.stringify([
      { file: 'first.md', violationCodes: ['TEST-1', 'TEST-2'] },
      { file: 'second.md', violationCodes: ['TEST-1'] },
    ]) + '\n',
  );
});

test('outputs callback errors instead of reported violations with exit code 1', context => {
  const result = runFixture({
    context,
    callback: `reportViolation({ file: 'packages/example/README.md', violationCode: 'TEST-1' });
      await Promise.reject(new Error('Verification failed'));`,
  });

  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /Error: Verification failed/);
  assert.doesNotMatch(result.stderr, /violates/);
});

test('outputs non-Error thrown values with exit code 1', context => {
  const result = runFixture({
    context,
    callback: "throw 'Verification failed';",
  });

  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.equal(
    result.stderr,
    '✖ Test Guidelines:\n  ERROR: Verification failed\n',
  );
});

test('throws for an invalid violation code', context => {
  const result = runFixture({
    context,
    callback: `assert.throws(
      () => reportViolation({ file: 'packages/example/README.md', violationCode: 'UNKNOWN' }),
      { message: 'Invalid violation code "UNKNOWN" in guideline file ".agents/guidelines/example.md".' },
    );`,
  });

  assert.equal(result.status, 0);
  assert.equal(result.stdout, '✓ Test Guidelines\n');
  assert.equal(result.stderr, '');
});

test('outputs uncaught invalid violation codes with exit code 1', context => {
  const result = runFixture({
    context,
    callback:
      "reportViolation({ file: 'packages/example/README.md', violationCode: 'UNKNOWN' });",
  });

  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /Invalid violation code "UNKNOWN"/);
});

test('parses H2 violation codes outside fenced examples', context => {
  const result = runFixture({
    context,
    guidelineSource:
      '---\r\nfileMatcher: []\r\n---\r\n' +
      '# Custom Guidelines\r\n\r\n' +
      '````md\r\n## FENCED-1: Example\r\n```\r\n````\r\n' +
      '~~~md\r\n## FENCED-2: Example\r\n~~~\r\n' +
      '### NESTED-1: Not an H2\r\n' +
      '## CUSTOM-1: Actual rule\r\n## CUSTOM-2\r\n',
    callback: `for (const violationCode of ['FENCED-1', 'FENCED-2', 'NESTED-1']) {
        assert.throws(() => reportViolation({ file: 'example.ts', violationCode }));
      }
      reportViolation({ file: 'example.ts', violationCode: 'CUSTOM-1' });
      reportViolation({ file: 'example.ts', violationCode: 'CUSTOM-2' });`,
  });

  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  assert.equal(
    result.stderr,
    '✖ Custom Guidelines (see `.agents/guidelines/example.md`):\n' +
      '  - example.ts: violates `CUSTOM-1`, `CUSTOM-2`\n',
  );
});

test('outputs input parsing errors without invoking the callback', context => {
  const result = runFixture({
    context,
    args: ['--file'],
    callback: "throw new Error('Callback was invoked');",
  });

  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /ERR_PARSE_ARGS_INVALID_OPTION_VALUE/);
  assert.doesNotMatch(result.stderr, /Callback was invoked/);
});

test('outputs guideline read errors without invoking the callback', context => {
  const result = runFixture({
    context,
    guidelineSource: null,
    callback: "throw new Error('Callback was invoked');",
  });

  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /ENOENT/);
  assert.doesNotMatch(result.stderr, /Callback was invoked/);
});

test('outputs guideline title parsing errors with exit code 1', context => {
  const result = runFixture({
    context,
    guidelineSource: '---\nfileMatcher: []\n---\n## TEST-1: First rule\n',
    callback: '',
  });

  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(
    result.stderr,
    /No H1 heading found in guideline file "example.md"/,
  );
});

test('captures sorted files from positive globs, deduplicating overlaps and excluding negative matches and directories', context => {
  const result = runFixture({
    context,
    guidelineSource: defaultGuidelineSource.replace(
      'fileMatcher: []',
      `fileMatcher:
  - '!packages/excluded/**'
  - 'packages/**'
  - 'packages/*/README.md'`,
    ),
    files: {
      'packages/z/README.md': '',
      'packages/a/README.md': '',
      'packages/a/src/index.ts': '',
      'packages/excluded/README.md': '',
      'examples/README.md': '',
    },
    callback: `assert.deepEqual(files, [
      'packages/a/README.md',
      'packages/a/src/index.ts',
      'packages/z/README.md',
    ]);`,
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '✓ Test Guidelines\n');
  assert.equal(result.stderr, '');
});

test('uses only explicit input files, including matching paths that no longer exist', context => {
  const result = runFixture({
    context,
    guidelineSource: defaultGuidelineSource.replace(
      'fileMatcher: []',
      "fileMatcher: ['packages/*/README.md']",
    ),
    args: ['--file', 'packages/deleted/README.md'],
    files: { 'packages/existing/README.md': '' },
    callback: "assert.deepEqual(files, ['packages/deleted/README.md']);",
  });

  assert.equal(result.status, 0, result.stderr);
});

for (const file of ['examples/README.md', 'packages/excluded/README.md']) {
  test(`rejects nonmatching input file ${file} without invoking the callback`, context => {
    const result = runFixture({
      context,
      guidelineSource: defaultGuidelineSource.replace(
        'fileMatcher: []',
        "fileMatcher: ['!packages/excluded/**', 'packages/**']",
      ),
      args: ['--file', 'packages/allowed/README.md', '--file', file],
      callback: "throw new Error('Callback was invoked');",
    });

    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.ok(
      result.stderr.includes(`Input file "${file}" does not match fileMatcher`),
    );
    assert.doesNotMatch(result.stderr, /Callback was invoked/);
  });
}

for (const fileMatcher of ['[]', "['!packages/**']"]) {
  test(`captures no files for fileMatcher ${fileMatcher}`, context => {
    const result = runFixture({
      context,
      guidelineSource: defaultGuidelineSource.replace(
        'fileMatcher: []',
        `fileMatcher: ${fileMatcher}`,
      ),
      files: { 'packages/example/README.md': '' },
      callback: 'assert.deepEqual(files, []);',
    });

    assert.equal(result.status, 0, result.stderr);
  });

  test(`rejects explicit files for fileMatcher ${fileMatcher}`, context => {
    const result = runFixture({
      context,
      guidelineSource: defaultGuidelineSource.replace(
        'fileMatcher: []',
        `fileMatcher: ${fileMatcher}`,
      ),
      args: ['--file', 'packages/example/README.md'],
      callback: "throw new Error('Callback was invoked');",
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /does not match fileMatcher/);
    assert.doesNotMatch(result.stderr, /Callback was invoked/);
  });
}

test('parses YAML frontmatter with a BOM, CRLF, comments and an inline list', context => {
  const result = runFixture({
    context,
    guidelineSource: defaultGuidelineSource
      .replace(
        'fileMatcher: []',
        "fileMatcher: ['packages/**', '!packages/excluded/**'] # files",
      )
      .replace(/^/, '\uFEFF')
      .replaceAll('\n', '\r\n'),
    files: {
      'packages/example/README.md': '',
      'packages/excluded/README.md': '',
    },
    callback: "assert.deepEqual(files, ['packages/example/README.md']);",
  });

  assert.equal(result.status, 0, result.stderr);
});

for (const frontmatter of [
  'fileMatcher: packages/**',
  'fileMatcher: [1]',
  'fileMatcher: [null]',
  'fileMatcher: null',
  'other: []',
  'null',
  '[]',
]) {
  test(`rejects invalid frontmatter ${frontmatter}`, context => {
    const result = runFixture({
      context,
      guidelineSource: defaultGuidelineSource.replace(
        'fileMatcher: []',
        frontmatter,
      ),
      callback: "throw new Error('Callback was invoked');",
    });

    assert.equal(result.status, 1);
    assert.match(
      result.stderr,
      /Guideline frontmatter must contain fileMatcher: string\[\]/,
    );
    assert.doesNotMatch(result.stderr, /Callback was invoked/);
  });
}

test('rejects malformed YAML without invoking the callback', context => {
  const result = runFixture({
    context,
    guidelineSource: defaultGuidelineSource.replace(
      'fileMatcher: []',
      'fileMatcher: [',
    ),
    callback: "throw new Error('Callback was invoked');",
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /YAMLParseError/);
  assert.doesNotMatch(result.stderr, /Callback was invoked/);
});

test('rejects missing frontmatter without invoking the callback', context => {
  const result = runFixture({
    context,
    guidelineSource: '# Test Guidelines\n',
    callback: "throw new Error('Callback was invoked');",
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Guideline file must contain YAML frontmatter/);
  assert.doesNotMatch(result.stderr, /Callback was invoked/);
});
