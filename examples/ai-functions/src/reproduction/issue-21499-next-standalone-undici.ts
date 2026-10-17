import { spawn } from 'node:child_process';
import { cpSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createConnection, createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);
const workDirectory = join(repoRoot, '.issue-21499-reproduction');
const appDirectory = join(workDirectory, 'app');
const packageDirectory = join(workDirectory, 'package');

type CaseResult = {
  name: string;
  status: number;
  body: { ok: boolean; message?: string; size?: number };
  undiciFileCount: number;
};

async function run(
  command: string,
  args: string[],
  options: { cwd: string; quiet?: boolean },
): Promise<string> {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  child.stdout.on('data', chunk => {
    output += chunk;
  });
  child.stderr.on('data', chunk => {
    output += chunk;
  });

  const exitCode = await new Promise<number | null>((resolveExit, reject) => {
    child.once('error', reject);
    child.once('exit', resolveExit);
  });

  if (exitCode !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} exited with ${exitCode}\n${output}`,
    );
  }

  if (!options.quiet) {
    process.stdout.write(output);
  }

  return output;
}

async function getAvailablePort(): Promise<number> {
  return await new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address == null || typeof address === 'string') {
        server.close();
        reject(new Error('Could not allocate a local port'));
        return;
      }
      server.close(error => {
        if (error) {
          reject(error);
        } else {
          resolvePort(address.port);
        }
      });
    });
  });
}

async function waitForServer(port: number): Promise<void> {
  const deadline = Date.now() + 10_000;

  while (Date.now() < deadline) {
    const connected = await new Promise<boolean>(resolveConnection => {
      const socket = createConnection({ host: '127.0.0.1', port });
      const finish = (result: boolean) => {
        socket.destroy();
        resolveConnection(result);
      };
      socket.once('connect', () => finish(true));
      socket.once('error', () => finish(false));
    }).catch(() => false);

    if (connected) {
      return;
    }

    await new Promise(resolveDelay => setTimeout(resolveDelay, 100));
  }

  throw new Error(`Standalone server did not listen on port ${port}`);
}

function countUndiciFiles(directory: string): number {
  let count = 0;

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      count += countUndiciFiles(path);
    } else if (path.includes('/node_modules/undici/')) {
      count++;
    }
  }

  return count;
}

function findServer(directory: string): string | undefined {
  const entries = readdirSync(directory, { withFileTypes: true });
  const serverEntry = entries.find(
    entry => entry.isFile() && entry.name === 'server.js',
  );
  if (serverEntry != null) {
    return join(directory, serverEntry.name);
  }

  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      const nested = findServer(path);
      if (nested != null) {
        return nested;
      }
    }
  }

  return undefined;
}

async function runCase({
  name,
  webpack,
  external,
}: {
  name: string;
  webpack: boolean;
  external: boolean;
}): Promise<CaseResult> {
  const nextDirectory = join(appDirectory, '.next');
  const deploymentDirectory = join(workDirectory, `deployment-${name}`);
  rmSync(nextDirectory, { recursive: true, force: true });
  rmSync(deploymentDirectory, { recursive: true, force: true });

  writeFileSync(
    join(appDirectory, 'next.config.mjs'),
    external
      ? "export default { output: 'standalone', serverExternalPackages: ['@ai-sdk/provider-utils'] };\n"
      : "export default { output: 'standalone' };\n",
  );

  await run(
    'pnpm',
    ['exec', 'next', 'build', ...(webpack ? ['--webpack'] : [])],
    { cwd: appDirectory, quiet: true },
  );

  cpSync(join(nextDirectory, 'standalone'), deploymentDirectory, {
    recursive: true,
  });

  const serverPath = findServer(deploymentDirectory);
  if (serverPath == null) {
    throw new Error(`No standalone server.js was emitted for ${name}`);
  }

  const port = await getAvailablePort();
  const { NODE_PATH: _nodePath, ...environmentWithoutNodePath } = process.env;
  const server = spawn(process.execPath, [serverPath], {
    cwd: dirname(serverPath),
    env: {
      ...environmentWithoutNodePath,
      HOSTNAME: '127.0.0.1',
      PORT: String(port),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let serverOutput = '';
  server.stdout.on('data', chunk => {
    serverOutput += chunk;
  });
  server.stderr.on('data', chunk => {
    serverOutput += chunk;
  });

  try {
    await waitForServer(port);
    const response = await fetch(`http://127.0.0.1:${port}/api/dl`, {
      signal: AbortSignal.timeout(20_000),
    });
    const body = (await response.json()) as CaseResult['body'];

    return {
      name,
      status: response.status,
      body,
      undiciFileCount: countUndiciFiles(deploymentDirectory),
    };
  } catch (error) {
    throw new Error(
      `${name} standalone request failed outside the reported behavior: ${String(error)}\n${serverOutput}`,
    );
  } finally {
    server.kill('SIGTERM');
    await new Promise<void>(resolveExit => {
      if (server.exitCode != null) {
        resolveExit();
        return;
      }
      server.once('exit', () => resolveExit());
      setTimeout(() => {
        server.kill('SIGKILL');
        resolveExit();
      }, 2_000).unref();
    });
  }
}

async function main() {
  rmSync(workDirectory, { recursive: true, force: true });
  mkdirSync(join(appDirectory, 'app/api/dl'), { recursive: true });
  mkdirSync(packageDirectory, { recursive: true });

  try {
    await run('pnpm', ['build'], {
      cwd: join(repoRoot, 'packages/provider-utils'),
      quiet: true,
    });
    await run('pnpm', ['pack', '--pack-destination', packageDirectory], {
      cwd: join(repoRoot, 'packages/provider-utils'),
      quiet: true,
    });

    const providerUtilsTarball = readdirSync(packageDirectory).find(file =>
      file.endsWith('.tgz'),
    );
    if (providerUtilsTarball == null) {
      throw new Error('provider-utils pack did not produce a tarball');
    }

    writeFileSync(
      join(appDirectory, 'package.json'),
      `${JSON.stringify(
        {
          name: 'undici-trace-repro',
          private: true,
          dependencies: {
            '@ai-sdk/provider-utils': `file:../package/${providerUtilsTarball}`,
            next: '16.3.3',
            react: '19.3.0',
            'react-dom': '19.3.0',
            zod: '4.1.12',
          },
        },
        null,
        2,
      )}\n`,
    );
    writeFileSync(
      join(appDirectory, 'app/api/dl/route.js'),
      `import { downloadBlob } from '@ai-sdk/provider-utils';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const blob = await downloadBlob('https://example.com/');
    return Response.json({ ok: true, size: blob.size });
  } catch (error) {
    return Response.json(
      { ok: false, message: String(error.message) },
      { status: 500 },
    );
  }
}
`,
    );

    await run(
      'pnpm',
      ['install', '--ignore-workspace', '--prefer-offline', '--ignore-scripts'],
      { cwd: appDirectory, quiet: true },
    );

    const results = [];
    for (const testCase of [
      { name: 'turbopack-bundled', webpack: false, external: false },
      { name: 'turbopack-external', webpack: false, external: true },
      { name: 'webpack-bundled', webpack: true, external: false },
      { name: 'webpack-external', webpack: true, external: true },
    ]) {
      const result = await runCase(testCase);
      results.push(result);
      console.log(
        `${result.name}: status=${result.status}, ok=${result.body.ok}, undiciFiles=${result.undiciFileCount}`,
      );
    }

    const unrelatedFailures = results.filter(
      result =>
        !result.body.ok &&
        !result.body.message?.includes("Cannot find module 'undici'"),
    );
    if (unrelatedFailures.length > 0) {
      throw new Error(
        `Download failed for an unrelated reason:\n${JSON.stringify(unrelatedFailures, null, 2)}`,
      );
    }

    const moduleFailures = results.filter(result =>
      result.body.message?.includes("Cannot find module 'undici'"),
    );

    if (moduleFailures.length > 0) {
      console.error(
        'ISSUE_21499_REPRODUCED: standalone Next.js download failed because provider-utils could not resolve undici',
      );
      process.exitCode = 1;
    }
  } finally {
    rmSync(workDirectory, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 2;
});
