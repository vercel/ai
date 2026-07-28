import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(
  new URL('../../../..', new URL('.', import.meta.url)),
);
const cliPath = fileURLToPath(
  new URL(
    '../../../../packages/devtools/bin/cli.js',
    new URL('.', import.meta.url),
  ),
);

async function getAvailablePort(): Promise<number> {
  const server = createServer();

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, 'localhost', resolve);
  });

  const address = server.address();
  if (address == null || typeof address === 'string') {
    server.close();
    throw new Error('Failed to allocate a local port');
  }

  await new Promise<void>((resolve, reject) => {
    server.close(error => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

  return address.port;
}

async function stopProcess(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  child.kill('SIGTERM');
  await Promise.race([
    new Promise<void>(resolve => child.once('exit', () => resolve())),
    new Promise<void>(resolve => setTimeout(resolve, 2_000)),
  ]);

  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL');
  }
}

async function fetchViewer(port: number): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      return await fetch(`http://localhost:${port}`);
    } catch (error) {
      lastError = error;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  throw lastError;
}

async function main() {
  const port = await getAvailablePort();
  const {
    AI_SDK_DEVTOOLS_DEV: _devMode,
    AI_SDK_DEVTOOLS_PORT: _configuredPort,
    ...environment
  } = process.env;
  const child = spawn(process.execPath, [cliPath], {
    cwd: repoRoot,
    env: {
      ...environment,
      AI_SDK_DEVTOOLS_PORT: String(port),
      // This triggered development mode in the affected releases.
      NODE_ENV: 'development',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  child.stdout?.on('data', chunk => {
    output += chunk;
  });
  child.stderr?.on('data', chunk => {
    output += chunk;
  });

  try {
    const response = await fetchViewer(port);
    const html = await response.text();

    if (!response.ok) {
      throw new Error(`Viewer returned HTTP ${response.status}`);
    }
    if (html.includes('Development Mode') || html.includes('localhost:5173')) {
      throw new Error(
        'Issue reproduced: port 4983 returned the Development Mode page pointing to localhost:5173',
      );
    }
    if (!html.includes('<div id="root"></div>')) {
      throw new Error('Viewer did not return the bundled client index');
    }

    const assetPath = html.match(/src="(\/assets\/[^"]+\.js)"/)?.[1];
    if (assetPath === undefined) {
      throw new Error(
        'Bundled client index did not reference a JavaScript asset',
      );
    }

    const assetResponse = await fetch(`http://localhost:${port}${assetPath}`);
    if (!assetResponse.ok) {
      throw new Error(`Bundled UI asset returned HTTP ${assetResponse.status}`);
    }

    console.log(
      'Issue 11812 not reproduced: DevTools served the bundled UI and its JavaScript asset instead of the Development Mode page.',
    );
  } catch (error) {
    if (output) {
      console.error(output.trim());
    }
    throw error;
  } finally {
    await stopProcess(child);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
