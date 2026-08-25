import { spawnSync } from 'node:child_process';
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const affectedPackages = [
  'packages/test-server',
  'packages/mcp',
  'packages/huggingface',
  'packages/baseten',
] as const;

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);

async function pathExists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function runCleanScript(cleanScript: string) {
  const sandbox = await mkdtemp(join(tmpdir(), 'ai-sdk-17951-'));
  const binDirectory = join(sandbox, 'bin');
  const distDirectory = join(sandbox, 'dist');
  const buildInfoPath = join(sandbox, 'reproduction.tsbuildinfo');

  try {
    await mkdir(binDirectory);
    await mkdir(distDirectory);
    await writeFile(join(distDirectory, 'marker.txt'), 'must be deleted');
    await writeFile(buildInfoPath, 'must be deleted');

    await symlink(
      resolve(repositoryRoot, 'node_modules/del-cli/cli.js'),
      join(binDirectory, 'del-cli'),
    );
    await symlink(
      process.execPath,
      join(binDirectory, basename(process.execPath)),
    );

    const result = spawnSync('/bin/sh', ['-c', cleanScript], {
      cwd: sandbox,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: binDirectory,
      },
    });

    return {
      artifactsDeleted:
        !(await pathExists(distDirectory)) &&
        !(await pathExists(buildInfoPath)),
      output: `${result.stdout}${result.stderr}`,
      status: result.status,
    };
  } finally {
    await rm(sandbox, { force: true, recursive: true });
  }
}

async function main() {
  const control = await runCleanScript('del-cli dist *.tsbuildinfo');

  if (control.status !== 0 || !control.artifactsDeleted) {
    throw new Error(
      `Reproduction harness error: del-cli control failed: ${control.output}`,
    );
  }

  const reportedFailures: string[] = [];
  const unexpectedFailures: string[] = [];

  for (const packageDirectory of affectedPackages) {
    const packageJson = JSON.parse(
      await readFile(
        resolve(repositoryRoot, packageDirectory, 'package.json'),
        'utf8',
      ),
    ) as {
      name: string;
      scripts?: { clean?: string };
    };
    const cleanScript = packageJson.scripts?.clean;

    if (cleanScript === undefined) {
      unexpectedFailures.push(`${packageJson.name}: no clean script`);
      continue;
    }

    const result = await runCleanScript(cleanScript);

    if (result.status === 0 && result.artifactsDeleted) {
      continue;
    }

    if (
      cleanScript.startsWith('rm ') &&
      /rm: (?:not found|command not found)/u.test(result.output)
    ) {
      reportedFailures.push(packageJson.name);
    } else {
      unexpectedFailures.push(
        `${packageJson.name}: ${result.output.trim() || 'artifacts remained'}`,
      );
    }
  }

  if (unexpectedFailures.length > 0) {
    throw new Error(
      `Unexpected clean failures:\n${unexpectedFailures.join('\n')}`,
    );
  }

  if (reportedFailures.length > 0) {
    throw new Error(
      `Windows-compatible clean failed because "rm" is unavailable: ${reportedFailures.join(', ')}`,
    );
  }

  console.log('All affected package clean scripts are cross-platform.');
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
