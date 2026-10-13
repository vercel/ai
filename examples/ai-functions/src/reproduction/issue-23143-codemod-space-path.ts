import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const source = 'const options = { system: "hello" };';
const transform = 'v7/rename-system-to-instructions';
const failureSignal =
  'ISSUE_23143: codemod skipped valid paths containing spaces';

type RunResult = {
  status: number | null;
  stderr: string;
};

function runCodemod(cli: string, cwd: string, target: string): RunResult {
  const result = spawnSync(
    process.execPath,
    [cli, transform, target, '-j', '--run-in-band'],
    {
      cwd,
      encoding: 'utf8',
    },
  );

  return {
    status: result.status,
    stderr: result.stderr,
  };
}

async function main() {
  const repositoryRoot = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../../..',
  );
  const cli = join(repositoryRoot, 'packages/codemod/dist/bin/codemod.js');
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'ai-sdk-issue-23143-'));

  try {
    const plainFile = join(temporaryRoot, 'plain.ts');
    const spacedFile = join(temporaryRoot, 'my file.ts');
    const spacedDirectory = join(temporaryRoot, 'project with space');
    const fileInSpacedDirectory = join(spacedDirectory, 'nested.ts');

    mkdirSync(spacedDirectory);
    writeFileSync(plainFile, source);
    writeFileSync(spacedFile, source);
    writeFileSync(fileInSpacedDirectory, source);

    const plainResult = runCodemod(cli, temporaryRoot, plainFile);
    const spacedFileResult = runCodemod(cli, temporaryRoot, spacedFile);
    const spacedDirectoryResult = runCodemod(
      cli,
      temporaryRoot,
      spacedDirectory,
    );

    for (const [label, result] of [
      ['plain file', plainResult],
      ['spaced filename', spacedFileResult],
      ['spaced directory', spacedDirectoryResult],
    ] as const) {
      assert.equal(
        result.status,
        0,
        `${label} invocation exited ${result.status}: ${result.stderr}`,
      );
    }

    const plainOutput = readFileSync(plainFile, 'utf8');
    const spacedFileOutput = readFileSync(spacedFile, 'utf8');
    const spacedDirectoryOutput = readFileSync(fileInSpacedDirectory, 'utf8');

    assert.match(
      plainOutput,
      /instructions:\s*"hello"/,
      'Control file was not transformed',
    );

    const skippedPaths: string[] = [];
    if (spacedFileOutput !== plainOutput) {
      skippedPaths.push('filename');
    }
    if (spacedDirectoryOutput !== plainOutput) {
      skippedPaths.push('directory');
    }

    if (skippedPaths.length > 0) {
      console.error(
        `${failureSignal}: ${skippedPaths.join(' and ')} remained unchanged while the plain-path control migrated`,
      );
      process.exitCode = 1;
      return;
    }

    console.log('Issue #23143 did not reproduce.');
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error('REPRODUCTION_HARNESS_ERROR', error);
  process.exitCode = 2;
});
