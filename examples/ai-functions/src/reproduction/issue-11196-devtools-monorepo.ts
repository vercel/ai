import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';

const devtoolsVersion = '1.0.5';
const repositoryRoot = path.resolve(import.meta.dirname, '../../../..');

interface ViewerResult {
  exitCode: number | null;
  logs: string;
  runs?: unknown;
  started: boolean;
}

async function getAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();

    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      assert.ok(address && typeof address !== 'string');

      server.close(error => {
        if (error) {
          reject(error);
        } else {
          resolve(address.port);
        }
      });
    });
  });
}

function installDependencies(monorepoRoot: string): void {
  const result = spawnSync('pnpm', ['install', '--ignore-scripts'], {
    cwd: monorepoRoot,
    encoding: 'utf8',
  });

  assert.equal(
    result.status,
    0,
    `pnpm install failed:\n${result.stdout}${result.stderr}`,
  );
}

async function stopProcessGroup(
  child: ReturnType<typeof spawn>,
): Promise<void> {
  if (child.pid == null || child.exitCode != null) {
    return;
  }

  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    return;
  }

  await Promise.race([
    new Promise<void>(resolve => child.once('exit', () => resolve())),
    new Promise<void>(resolve => setTimeout(resolve, 1_000)),
  ]);

  if (child.exitCode == null) {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      // The process exited between the exit-code check and the signal.
    }
  }
}

async function launchViewer(appDirectory: string): Promise<ViewerResult> {
  const port = await getAvailablePort();
  const child = spawn('npx', ['--yes', '@ai-sdk/devtools'], {
    cwd: appDirectory,
    detached: true,
    env: {
      ...process.env,
      AI_SDK_DEVTOOLS_PORT: String(port),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let logs = '';
  child.stdout.on('data', chunk => {
    logs += chunk.toString();
  });
  child.stderr.on('data', chunk => {
    logs += chunk.toString();
  });

  try {
    const deadline = Date.now() + 10_000;

    while (Date.now() < deadline) {
      if (child.exitCode != null) {
        return {
          exitCode: child.exitCode,
          logs,
          started: false,
        };
      }

      try {
        const response = await fetch(`http://localhost:${port}/api/runs`);
        if (response.ok) {
          return {
            exitCode: child.exitCode,
            logs,
            runs: await response.json(),
            started: true,
          };
        }
      } catch {
        // The viewer has not started yet.
      }

      await new Promise(resolve => setTimeout(resolve, 200));
    }

    return {
      exitCode: child.exitCode,
      logs,
      started: false,
    };
  } finally {
    await stopProcessGroup(child);
  }
}

async function main() {
  const monorepoRoot = await fs.mkdtemp(
    path.join(repositoryRoot, '.tmp-issue-11196-'),
  );
  const appDirectory = path.join(monorepoRoot, 'apps/www');
  const sharedAiDirectory = path.join(monorepoRoot, 'packages/ai');

  try {
    await fs.mkdir(appDirectory, { recursive: true });
    await fs.mkdir(sharedAiDirectory, { recursive: true });

    await fs.writeFile(
      path.join(monorepoRoot, 'package.json'),
      JSON.stringify(
        {
          name: 'issue-11196-monorepo',
          private: true,
          workspaces: ['apps/*', 'packages/*'],
        },
        null,
        2,
      ),
    );
    await fs.writeFile(
      path.join(monorepoRoot, 'pnpm-workspace.yaml'),
      "packages:\n  - 'apps/*'\n  - 'packages/*'\n",
    );
    await fs.writeFile(
      path.join(sharedAiDirectory, 'package.json'),
      JSON.stringify(
        {
          name: '@issue-11196/ai',
          version: '1.0.0',
          private: true,
          dependencies: {
            '@ai-sdk/devtools': devtoolsVersion,
          },
        },
        null,
        2,
      ),
    );

    const appPackageJsonPath = path.join(appDirectory, 'package.json');
    await fs.writeFile(
      appPackageJsonPath,
      JSON.stringify(
        {
          name: '@issue-11196/www',
          version: '1.0.0',
          private: true,
          dependencies: {
            '@issue-11196/ai': 'workspace:*',
          },
        },
        null,
        2,
      ),
    );

    await fs.mkdir(path.join(appDirectory, '.devtools'), { recursive: true });
    await fs.writeFile(
      path.join(appDirectory, '.devtools/generations.json'),
      JSON.stringify(
        {
          runs: [
            {
              id: 'run-11196',
              started_at: '2026-07-14T00:00:00.000Z',
              parent_run_id: null,
              parent_step_id: null,
              function_id: null,
            },
          ],
          steps: [
            {
              id: 'step-11196',
              run_id: 'run-11196',
              step_number: 0,
              type: 'generate',
              model_id: 'test-model',
              provider: 'test-provider',
              started_at: '2026-07-14T00:00:00.000Z',
              duration_ms: 1,
              input: JSON.stringify({
                prompt: [{ role: 'user', content: 'monorepo run' }],
              }),
              output: '[]',
              usage: null,
              error: null,
              raw_request: null,
              raw_response: null,
              raw_chunks: null,
              provider_options: null,
            },
          ],
        },
        null,
        2,
      ),
    );

    installDependencies(monorepoRoot);

    const appDevtoolsBin = path.join(
      appDirectory,
      'node_modules/.bin/devtools',
    );
    await assert.rejects(fs.access(appDevtoolsBin));

    const withoutDirectDependency = await launchViewer(appDirectory);

    await fs.writeFile(
      appPackageJsonPath,
      JSON.stringify(
        {
          name: '@issue-11196/www',
          version: '1.0.0',
          private: true,
          dependencies: {
            '@ai-sdk/devtools': devtoolsVersion,
            '@issue-11196/ai': 'workspace:*',
          },
        },
        null,
        2,
      ),
    );
    installDependencies(monorepoRoot);

    const withDirectDependency = await launchViewer(appDirectory);

    console.log(
      JSON.stringify(
        {
          withoutDirectDependency,
          withDirectDependency,
        },
        null,
        2,
      ),
    );

    assert.equal(
      withDirectDependency.started,
      true,
      'Control failed: DevTools should start after it is installed directly in the app.',
    );
    assert.ok(Array.isArray(withDirectDependency.runs));
    assert.equal(withDirectDependency.runs.length, 1);
    assert.equal(withDirectDependency.runs[0].id, 'run-11196');
    assert.equal(withDirectDependency.runs[0].firstMessage, 'monorepo run');

    assert.equal(
      withoutDirectDependency.started,
      true,
      `Expected the documented \`npx @ai-sdk/devtools\` command to start from the app without a direct dependency, but it exited with ${withoutDirectDependency.exitCode}:\n${withoutDirectDependency.logs}`,
    );
  } finally {
    await fs.rm(monorepoRoot, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
