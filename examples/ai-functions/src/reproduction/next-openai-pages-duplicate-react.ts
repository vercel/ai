import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';

async function getFreePort() {
  return new Promise<number>((resolvePort, reject) => {
    const server = createServer();

    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();

      if (address == null || typeof address === 'string') {
        server.close();
        reject(new Error('Unable to allocate a local TCP port.'));
        return;
      }

      const { port } = address;
      server.close(error => {
        if (error != null) {
          reject(error);
          return;
        }

        resolvePort(port);
      });
    });
  });
}

async function waitForServer({
  baseUrl,
  process,
  getLog,
}: {
  baseUrl: string;
  process: ChildProcessWithoutNullStreams;
  getLog: () => string;
}) {
  for (let attempt = 0; attempt < 120; attempt++) {
    if (process.exitCode != null) {
      throw new Error(
        `Next.js dev server exited before becoming ready.\n\n${getLog()}`,
      );
    }

    try {
      const response = await fetch(baseUrl);

      if (response.ok) {
        return;
      }
    } catch {
      // keep polling until the server is ready or the timeout expires
    }

    await delay(500);
  }

  throw new Error(`Next.js dev server did not become ready.\n\n${getLog()}`);
}

async function stopServer(process: ChildProcessWithoutNullStreams) {
  if (process.exitCode != null) {
    return;
  }

  process.kill('SIGTERM');

  for (let attempt = 0; attempt < 20; attempt++) {
    if (process.exitCode != null) {
      return;
    }

    await delay(100);
  }

  process.kill('SIGKILL');
}

async function main() {
  const repoRoot = resolve(process.cwd(), '../..');
  const exampleDir = join(repoRoot, 'examples/next-openai-pages');
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  let serverLog = '';

  const devServer = spawn('pnpm', ['exec', 'next', 'dev', '-p', String(port)], {
    cwd: exampleDir,
    env: {
      ...process.env,
      NEXT_TELEMETRY_DISABLED: '1',
    },
  });

  devServer.stdout.on('data', chunk => {
    serverLog += chunk.toString();
  });
  devServer.stderr.on('data', chunk => {
    serverLog += chunk.toString();
  });

  try {
    await waitForServer({
      baseUrl,
      process: devServer,
      getLog: () => serverLog,
    });

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];

    page.on('pageerror', error => {
      pageErrors.push(error.stack ?? error.message);
    });
    page.on('console', message => {
      if (message.type() === 'error') {
        consoleErrors.push(message.text());
      }
    });

    try {
      await page.goto(`${baseUrl}/basics/stream-object`, {
        waitUntil: 'networkidle',
        timeout: 60_000,
      });
      await delay(3_000);
    } finally {
      await browser.close();
    }

    const duplicateReactUseIdError = pageErrors.find(
      error =>
        error.includes("Cannot read properties of null (reading 'useId')") &&
        error.includes('react@19.2.6') &&
        error.includes('react-dom@18.3.1'),
    );

    if (duplicateReactUseIdError != null) {
      throw new Error(
        [
          'Reproduced issue #16890: opening /basics/stream-object in examples/next-openai-pages throws the duplicate-React useId crash.',
          '',
          duplicateReactUseIdError,
          '',
          'Browser console errors:',
          ...consoleErrors.map(error => `- ${error}`),
        ].join('\n'),
      );
    }

    console.log(
      'Could not reproduce issue #16890: /basics/stream-object loaded without the duplicate-React useId crash.',
    );
  } finally {
    await stopServer(devServer);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
