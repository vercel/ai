import { spawn } from 'node:child_process';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const packages = [
  'packages/test-server',
  'packages/mcp',
  'packages/huggingface',
  'packages/baseten',
] as const;

const repositoryRoot = resolve(process.cwd(), '../..');

async function runCommand({
  command,
  cwd,
  path,
}: {
  command: string;
  cwd: string;
  path: string;
}) {
  return new Promise<{
    exitCode: number | null;
    stderr: string;
    stdout: string;
  }>((resolvePromise, reject) => {
    const child = spawn('/bin/sh', ['-c', command], {
      cwd,
      env: { ...process.env, PATH: path },
    });
    let stderr = '';
    let stdout = '';

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', chunk => {
      stderr += chunk;
    });
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      stdout += chunk;
    });
    child.on('error', reject);
    child.on('close', exitCode => {
      resolvePromise({ exitCode, stderr, stdout });
    });
  });
}

async function main() {
  const workspace = await mkdtemp(join(tmpdir(), 'ai-sdk-17951-'));
  const commandBin = join(workspace, 'bin');

  try {
    await mkdir(commandBin);

    // Keep the command environment sufficient for the cross-platform
    // `del-cli` replacement, while intentionally omitting the Unix-only `rm`.
    for (const command of ['node', 'dirname', 'sed', 'uname']) {
      const lookup = await runCommand({
        command: `command -v ${command}`,
        cwd: repositoryRoot,
        path: process.env.PATH ?? '',
      });
      const executable = lookup.stdout.trim();

      if (lookup.exitCode !== 0 || executable.length === 0) {
        throw new Error(`Reproduction setup could not locate ${command}`);
      }

      await symlink(executable, join(commandBin, command));
    }

    const restrictedPath = [
      join(repositoryRoot, 'node_modules/.bin'),
      commandBin,
    ].join(':');
    const rmFailures: string[] = [];

    for (const packagePath of packages) {
      const manifest = JSON.parse(
        await readFile(
          join(repositoryRoot, packagePath, 'package.json'),
          'utf8',
        ),
      ) as { name: string; scripts?: { clean?: string } };
      const cleanCommand = manifest.scripts?.clean;

      if (cleanCommand == null) {
        throw new Error(`${manifest.name} has no clean script`);
      }

      const scenarioDirectory = join(
        workspace,
        manifest.name.replace('/', '-'),
      );
      const sentinel = join(scenarioDirectory, 'dist', 'sentinel.txt');
      await mkdir(dirname(sentinel), { recursive: true });
      await writeFile(sentinel, 'must be removed by the clean script');
      await writeFile(join(scenarioDirectory, 'sentinel.tsbuildinfo'), 'stale');
      await chmod(scenarioDirectory, 0o755);

      const result = await runCommand({
        command: cleanCommand,
        cwd: scenarioDirectory,
        path: restrictedPath,
      });

      try {
        await readFile(sentinel);
      } catch {
        if (result.exitCode === 0) {
          continue;
        }
      }

      const output = `${result.stdout}\n${result.stderr}`;
      if (
        result.exitCode !== 0 &&
        /(?:^|\s)rm: (?:not found|command not found)/m.test(output)
      ) {
        rmFailures.push(manifest.name);
        continue;
      }

      throw new Error(
        `${manifest.name} clean produced an unexpected result: exit ${result.exitCode}\n${output}`,
      );
    }

    if (rmFailures.length > 0) {
      console.error(
        `Issue #17951 reproduced: clean scripts fail when rm is unavailable: ${rmFailures.join(', ')}`,
      );
      process.exitCode = 1;
      return;
    }

    console.log('All affected package clean scripts are cross-platform.');
  } finally {
    await rm(workspace, { force: true, recursive: true });
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
