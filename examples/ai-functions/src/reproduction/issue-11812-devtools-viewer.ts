import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';

async function getAvailablePort(): Promise<number> {
  const server = createServer();

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, 'localhost', resolve);
  });

  const address = server.address();
  if (address == null || typeof address === 'string') {
    server.close();
    throw new Error('Could not allocate a local port.');
  }

  const port = address.port;
  await new Promise<void>((resolve, reject) => {
    server.close(error => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });

  return port;
}

async function waitForViewer(
  url: string,
  child: ChildProcess,
  getOutput: () => string,
): Promise<Response> {
  const deadline = Date.now() + 10_000;

  while (Date.now() < deadline) {
    if (child.exitCode != null) {
      throw new Error(
        `DevTools viewer exited with code ${child.exitCode}.\n${getOutput()}`,
      );
    }

    try {
      return await fetch(url);
    } catch {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  throw new Error(`Timed out waiting for ${url}.\n${getOutput()}`);
}

async function stopViewer(child: ChildProcess): Promise<void> {
  if (child.exitCode != null) {
    return;
  }

  child.kill('SIGTERM');

  const exited = await Promise.race([
    new Promise<boolean>(resolve => child.once('exit', () => resolve(true))),
    new Promise<boolean>(resolve =>
      setTimeout(() => resolve(false), 2_000).unref(),
    ),
  ]);

  if (!exited && child.exitCode == null) {
    child.kill('SIGKILL');
    await new Promise<void>(resolve => child.once('exit', () => resolve()));
  }
}

async function main() {
  const port = await getAvailablePort();
  const cliPath = fileURLToPath(
    new URL('../../../../packages/devtools/bin/cli.js', import.meta.url),
  );
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    AI_SDK_DEVTOOLS_PORT: String(port),
    NODE_ENV: 'development',
  };
  delete env.AI_SDK_DEVTOOLS_DEV;

  const child = spawn(process.execPath, [cliPath], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  child.stdout?.on('data', chunk => {
    output += chunk.toString();
  });
  child.stderr?.on('data', chunk => {
    output += chunk.toString();
  });

  try {
    const origin = `http://localhost:${port}`;
    const response = await waitForViewer(origin, child, () => output);
    const html = await response.text();

    if (!response.ok) {
      throw new Error(`Viewer returned HTTP ${response.status}.\n${html}`);
    }
    if (html.includes('Development Mode') || html.includes('localhost:5173')) {
      throw new Error(
        'Issue #11812 reproduced: port 4983 served the Development Mode page linking to localhost:5173.',
      );
    }
    if (!html.includes('<div id="root"></div>')) {
      throw new Error('Viewer did not return the bundled DevTools index.');
    }

    const assetPath = html.match(/src="(\/assets\/[^"]+\.js)"/)?.[1];
    if (assetPath == null) {
      throw new Error('Bundled DevTools index did not reference a JS asset.');
    }

    const assetResponse = await fetch(`${origin}${assetPath}`);
    if (!assetResponse.ok || (await assetResponse.text()).length === 0) {
      throw new Error(
        `Bundled DevTools JS asset was not served (HTTP ${assetResponse.status}).`,
      );
    }

    console.log(
      'Issue #11812 not reproduced: the bundled DevTools index and JS asset were served without a localhost:5173 link.',
    );
  } finally {
    await stopViewer(child);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
