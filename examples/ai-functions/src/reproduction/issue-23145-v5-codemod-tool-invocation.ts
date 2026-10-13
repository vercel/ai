import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

async function main() {
  const repositoryRoot = resolve(process.cwd(), '../..');
  const codemodCli = join(
    repositoryRoot,
    'packages/codemod/dist/bin/codemod.js',
  );
  const directory = mkdtempSync(join(tmpdir(), 'ai-sdk-issue-23145-'));
  const fixturePath = join(directory, 'fixture.ts');

  try {
    writeFileSync(
      fixturePath,
      "const isTool = part.type === 'tool-invocation';\n",
    );

    const result = spawnSync(
      process.execPath,
      [codemodCli, 'v5', '-j', '--run-in-band'],
      {
        cwd: directory,
        encoding: 'utf8',
        timeout: 120_000,
      },
    );

    if (result.error != null) {
      throw result.error;
    }

    if (result.status !== 0) {
      throw new Error(
        `The v5 codemod bundle failed unexpectedly with exit code ${result.status}.\n${result.stderr}`,
      );
    }

    const transformedSource = readFileSync(fixturePath, 'utf8');

    if (!transformedSource.includes('FIXME(@ai-sdk-upgrade-v5)')) {
      console.error(
        'Issue #23145 reproduced: the v5 bundle completed without adding the required tool-invocation migration FIXME.',
      );
      process.exitCode = 1;
      return;
    }

    console.log(
      'The v5 bundle added the required tool-invocation migration FIXME.',
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
