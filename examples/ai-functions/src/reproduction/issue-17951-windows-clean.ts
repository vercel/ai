import { spawn } from 'node:child_process';
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';

const affectedPackages = [
  'packages/test-server',
  'packages/mcp',
  'packages/huggingface',
  'packages/baseten',
] as const;

async function runCleanScript({
  command,
  cwd,
  path,
}: {
  command: string;
  cwd: string;
  path: string;
}) {
  return new Promise<{ exitCode: number | null; stderr: string }>(
    (resolvePromise, reject) => {
      const child = spawn('/bin/sh', ['-c', command], {
        cwd,
        env: { ...process.env, PATH: path },
        stdio: ['ignore', 'ignore', 'pipe'],
      });

      let stderr = '';
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', chunk => {
        stderr += chunk;
      });
      child.on('error', reject);
      child.on('close', exitCode => {
        resolvePromise({ exitCode, stderr });
      });
    },
  );
}

async function pathExists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const repositoryRoot = resolve(process.cwd(), '../..');
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'ai-sdk-17951-'));
  const executableDirectory = join(temporaryRoot, 'bin');

  try {
    await mkdir(executableDirectory);
    await symlink(process.execPath, join(executableDirectory, 'node'));
    await symlink(
      await realpath(join(repositoryRoot, 'node_modules/del-cli/cli.js')),
      join(executableDirectory, 'del-cli'),
    );

    const failures: string[] = [];

    for (const packageDirectory of affectedPackages) {
      const packageJson = JSON.parse(
        await readFile(
          join(repositoryRoot, packageDirectory, 'package.json'),
          'utf8',
        ),
      ) as {
        name: string;
        scripts?: { clean?: string };
      };
      const cleanScript = packageJson.scripts?.clean;

      if (cleanScript == null) {
        failures.push(`${packageJson.name}: missing clean script`);
        continue;
      }

      const fixtureDirectory = join(
        temporaryRoot,
        packageDirectory.replaceAll('/', '-'),
      );
      const cleanupTargets = [
        join(fixtureDirectory, 'dist'),
        join(fixtureDirectory, 'example.tsbuildinfo'),
      ];

      await mkdir(cleanupTargets[0], { recursive: true });
      await writeFile(cleanupTargets[1], '');

      if (cleanScript.includes('docs')) {
        const docsDirectory = join(fixtureDirectory, 'docs');
        await mkdir(docsDirectory);
        cleanupTargets.push(docsDirectory);
      }

      const result = await runCleanScript({
        command: cleanScript,
        cwd: fixtureDirectory,
        path: executableDirectory,
      });
      const remainingTargets = [];

      for (const target of cleanupTargets) {
        if (await pathExists(target)) {
          remainingTargets.push(target);
        }
      }

      if (result.exitCode !== 0 || remainingTargets.length > 0) {
        failures.push(
          `${packageJson.name}: \`${cleanScript}\` exited ${
            result.exitCode
          }; ${result.stderr.trim() || 'cleanup targets remained'}`,
        );
      }
    }

    if (failures.length > 0) {
      console.error('Issue #17951: cross-platform clean failed');
      for (const failure of failures) {
        console.error(`- ${failure}`);
      }
      process.exitCode = 1;
      return;
    }

    console.log('All affected package clean scripts are cross-platform.');
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

void main();
