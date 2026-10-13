import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type CliResult = {
  status: number | null;
  stderr: string;
};

const codemodRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../packages/codemod',
);
const cliPath = join(codemodRoot, 'dist/bin/codemod.js');

function runCli(cwd: string, args: string[]): CliResult {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, NODE_NO_WARNINGS: '1' },
    timeout: 120_000,
  });

  assert.equal(
    result.error,
    undefined,
    `codemod process failed: ${result.error}`,
  );
  assert.equal(
    result.signal,
    null,
    `codemod process received ${result.signal}`,
  );

  return { status: result.status, stderr: result.stderr };
}

function assertSyntaxError(result: CliResult, scenario: string): void {
  assert.match(
    result.stderr,
    /SyntaxError: Unexpected token/,
    `${scenario} must report the source parse failure`,
  );
}

async function main(): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), 'ai-sdk-issue-23142-'));

  try {
    const directValidDir = join(root, 'direct-valid');
    mkdirSync(directValidDir);
    const directValidFile = join(directValidDir, 'valid.ts');
    writeFileSync(directValidFile, `const options = { system: 'hello' };\n`);
    const directValid = runCli(directValidDir, [
      'v7/rename-system-to-instructions',
      directValidFile,
      '-j',
      '--run-in-band',
    ]);
    assert.equal(
      directValid.status,
      0,
      'a valid individual transform must pass',
    );
    assert.match(
      readFileSync(directValidFile, 'utf8'),
      /instructions: 'hello'/,
      'the valid individual source must be migrated',
    );

    const directInvalidDir = join(root, 'direct-invalid');
    mkdirSync(directInvalidDir);
    const directInvalidFile = join(directInvalidDir, 'invalid.ts');
    writeFileSync(directInvalidFile, 'const broken = ;\n');
    const directInvalid = runCli(directInvalidDir, [
      'v7/rename-system-to-instructions',
      directInvalidFile,
      '-j',
      '--run-in-band',
    ]);
    assertSyntaxError(directInvalid, 'an invalid individual source');

    const directMixedDir = join(root, 'direct-mixed');
    mkdirSync(directMixedDir);
    writeFileSync(
      join(directMixedDir, 'valid.ts'),
      `const options = { system: 'hello' };\n`,
    );
    writeFileSync(join(directMixedDir, 'invalid.ts'), 'const broken = ;\n');
    const directMixed = runCli(directMixedDir, [
      'v7/rename-system-to-instructions',
      directMixedDir,
      '-j',
      '--run-in-band',
    ]);
    assertSyntaxError(directMixed, 'a mixed individual transform');

    const versionedValidDir = join(root, 'versioned-valid');
    mkdirSync(versionedValidDir);
    const versionedValidFile = join(versionedValidDir, 'valid.ts');
    writeFileSync(
      versionedValidFile,
      `const model = provider.textEmbedding('model-id');\n`,
    );
    const versionedValid = runCli(versionedValidDir, [
      'v6',
      '-j',
      '--run-in-band',
    ]);
    assert.equal(
      versionedValid.status,
      0,
      'valid versioned codemods must pass',
    );
    assert.match(
      readFileSync(versionedValidFile, 'utf8'),
      /provider\.embedding\('model-id'\)/,
      'the valid versioned source must be migrated',
    );

    const versionedInvalidDir = join(root, 'versioned-invalid');
    mkdirSync(versionedInvalidDir);
    writeFileSync(
      join(versionedInvalidDir, 'invalid.ts'),
      'const broken = ;\n',
    );
    const versionedInvalid = runCli(versionedInvalidDir, [
      'v6',
      '-j',
      '--run-in-band',
    ]);
    assertSyntaxError(versionedInvalid, 'an invalid versioned source');

    const versionedMixedDir = join(root, 'versioned-mixed');
    mkdirSync(versionedMixedDir);
    writeFileSync(
      join(versionedMixedDir, 'valid.ts'),
      `const model = provider.textEmbedding('model-id');\n`,
    );
    writeFileSync(join(versionedMixedDir, 'invalid.ts'), 'const broken = ;\n');
    const versionedMixed = runCli(versionedMixedDir, [
      'v6',
      '-j',
      '--run-in-band',
    ]);
    assertSyntaxError(versionedMixed, 'mixed versioned codemods');

    const successfulParseFailureScenarios = [
      ['individual invalid file', directInvalid.status],
      ['individual mixed directory', directMixed.status],
      ['versioned invalid file', versionedInvalid.status],
      ['versioned mixed directory', versionedMixed.status],
    ].filter(([, status]) => status === 0);

    if (successfulParseFailureScenarios.length > 0) {
      console.error(
        'ISSUE_23142: codemod reported a SyntaxError but exited with status 0',
      );
      console.error(
        successfulParseFailureScenarios
          .map(([scenario]) => `- ${scenario}`)
          .join('\n'),
      );
      process.exitCode = 1;
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

await main();
