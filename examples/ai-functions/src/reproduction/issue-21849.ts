import { spawn, type ChildProcess } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { cp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Page } from 'playwright';

const FAILURE_SIGNAL =
  'ISSUE_21849_REPRODUCED: useChat streaming starved App Router navigation';
const MAX_EXPECTED_NAVIGATION_MS = 2_500;

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, '../../../..');
const appDirectory = join(
  repositoryRoot,
  '.reproduction',
  'issue-21849-next-app',
);

async function write(relativePath: string, contents: string) {
  const path = join(appDirectory, relativePath);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents);
}

async function linkPackage(name: string, target: string) {
  const path = join(appDirectory, 'node_modules', ...name.split('/'));
  await mkdir(dirname(path), { recursive: true });
  await symlink(target, path, 'dir');
}

async function createApp() {
  await rm(appDirectory, { recursive: true, force: true });
  await mkdir(join(appDirectory, 'node_modules'), { recursive: true });

  const reactPackageRoot = join(repositoryRoot, 'packages', 'react');
  const reactPackageCopy = join(
    appDirectory,
    'node_modules',
    '@ai-sdk',
    'react',
  );
  await mkdir(reactPackageCopy, { recursive: true });
  await cp(join(reactPackageRoot, 'dist'), join(reactPackageCopy, 'dist'), {
    recursive: true,
  });
  await writeFile(
    join(reactPackageCopy, 'package.json'),
    await readFile(join(reactPackageRoot, 'package.json')),
  );

  await linkPackage(
    'react',
    join(repositoryRoot, 'apps', 'docs', 'node_modules', 'react'),
  );
  await linkPackage(
    'react-dom',
    join(repositoryRoot, 'apps', 'docs', 'node_modules', 'react-dom'),
  );
  await linkPackage(
    'next',
    join(repositoryRoot, 'apps', 'docs', 'node_modules', 'next'),
  );
  await linkPackage('ai', join(repositoryRoot, 'packages', 'ai'));
  await linkPackage(
    '@ai-sdk/provider',
    join(repositoryRoot, 'packages', 'provider'),
  );
  await linkPackage(
    '@ai-sdk/provider-utils',
    join(repositoryRoot, 'packages', 'provider-utils'),
  );
  await linkPackage('swr', join(reactPackageRoot, 'node_modules', 'swr'));
  await linkPackage(
    'throttleit',
    join(reactPackageRoot, 'node_modules', 'throttleit'),
  );

  await write(
    'package.json',
    JSON.stringify({
      name: 'issue-21849-reproduction',
      private: true,
      scripts: {},
    }),
  );

  await write(
    'next.config.mjs',
    `
export default {};
`,
  );

  await write(
    'app/layout.tsx',
    `
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html>
      <body>{children}</body>
    </html>
  );
}
`,
  );

  await write(
    'app/page.tsx',
    `
'use client';

import { Chat, useChat } from '@ai-sdk/react';
import type { UIMessage, UIMessageChunk } from 'ai';
import Link from 'next/link';
import {
  startTransition,
  use,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';

function createStreamingTransport() {
  return {
    async sendMessages() {
      let interval: ReturnType<typeof setInterval> | undefined;
      let finish: ReturnType<typeof setTimeout> | undefined;

      return new ReadableStream<UIMessageChunk>({
        start(controller) {
          controller.enqueue({ type: 'text-start', id: 'text-1' });
          interval = setInterval(() => {
            controller.enqueue({
              type: 'text-delta',
              id: 'text-1',
              delta: '.',
            });
          }, 10);
          finish = setTimeout(() => {
            clearInterval(interval);
            controller.enqueue({ type: 'text-end', id: 'text-1' });
            controller.close();
          }, 15_000);
        },
        cancel() {
          clearInterval(interval);
          clearTimeout(finish);
        },
      });
    },
    async reconnectToStream() {
      return null;
    },
  };
}

function CurrentUseChat({
  chat,
  shouldStream,
}: {
  chat: Chat<UIMessage>;
  shouldStream: boolean;
}) {
  const { messages, sendMessage, status } = useChat({
    chat,
    throttle: 50,
  });

  useEffect(() => {
    if (shouldStream) {
      void sendMessage({
        parts: [{ type: 'text', text: 'start streaming' }],
      });
    }
  }, [sendMessage, shouldStream]);

  return <ChatContents messages={messages} status={status} />;
}

function TransitionMessages({
  chat,
  shouldStream,
}: {
  chat: Chat<UIMessage>;
  shouldStream: boolean;
}) {
  const [messages, setMessages] = useState(chat.messages);
  const status = useSyncExternalStore(
    chat['~registerStatusCallback'],
    () => chat.status,
    () => chat.status,
  );

  useEffect(
    () =>
      chat['~registerMessagesCallback'](() => {
        startTransition(() => setMessages(chat.messages));
      }, 50),
    [chat],
  );

  useEffect(() => {
    if (shouldStream) {
      void chat.sendMessage({
        parts: [{ type: 'text', text: 'start streaming' }],
      });
    }
  }, [chat, shouldStream]);

  return <ChatContents messages={messages} status={status} />;
}

function ChatContents({
  messages,
  status,
}: {
  messages: Chat<UIMessage>['messages'];
  status: Chat<UIMessage>['status'];
}) {
  return (
    <main>
      <div id="status">{status}</div>
      <div id="message-length">
        {messages
          .flatMap(message => message.parts)
          .filter(part => part.type === 'text')
          .reduce((length, part) => length + part.text.length, 0)}
      </div>
      <Link id="heavy-link" href="/heavy">
        Open heavy destination
      </Link>
    </main>
  );
}

export default function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ priority?: string; stream?: string }>;
}) {
  const parameters = use(searchParams);
  const shouldStream = parameters.stream === '1';
  const chat = useMemo(
    () =>
      new Chat({
        id: 'issue-21849',
        transport: createStreamingTransport(),
      }),
    [],
  );

  return parameters.priority === 'transition' ? (
    <TransitionMessages chat={chat} shouldStream={shouldStream} />
  ) : (
    <CurrentUseChat chat={chat} shouldStream={shouldStream} />
  );
}
`,
  );

  await write(
    'app/heavy/page.tsx',
    `
'use client';

import { useEffect } from 'react';

function SlowRow({ index }: { index: number }) {
  const start = performance.now();
  while (performance.now() - start < 0.1) {
    // Make the destination render exceed the 50 ms useChat throttle window
    // while retaining enough React fibers for concurrent rendering to yield.
  }
  return <span>{index}</span>;
}

export default function HeavyPage() {
  useEffect(() => {
    document.documentElement.dataset.heavyCommitted = 'true';
  }, []);

  return (
    <main id="heavy-destination">
      {Array.from({ length: 2_000 }, (_, index) => (
        <SlowRow key={index} index={index} />
      ))}
    </main>
  );
}
`,
  );
}

async function runCommand(command: string, args: string[]) {
  return new Promise<void>((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: appDirectory,
      env: {
        ...process.env,
        NEXT_TELEMETRY_DISABLED: '1',
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
    child.once('error', reject);
    child.once('exit', code => {
      if (code === 0) {
        resolvePromise();
      } else {
        reject(
          new Error(
            `${command} ${args.join(' ')} exited with ${code}\n${output}`,
          ),
        );
      }
    });
  });
}

async function getAvailablePort() {
  return new Promise<number>((resolvePromise, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address == null || typeof address === 'string') {
        server.close();
        reject(new Error('Could not allocate a TCP port'));
        return;
      }
      server.close(error => {
        if (error) {
          reject(error);
        } else {
          resolvePromise(address.port);
        }
      });
    });
  });
}

async function waitForServer(url: string, child: ChildProcess) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (child.exitCode != null) {
      throw new Error(`Next.js server exited with ${child.exitCode}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // The server is not accepting connections yet.
    }
    await new Promise(resolvePromise => setTimeout(resolvePromise, 100));
  }
  throw new Error('Timed out waiting for the Next.js server');
}

async function stopServer(child: ChildProcess) {
  if (child.exitCode != null) {
    return;
  }
  child.kill('SIGTERM');
  await Promise.race([
    new Promise<void>(resolvePromise => {
      child.once('exit', () => resolvePromise());
    }),
    new Promise<void>(resolvePromise => {
      setTimeout(() => {
        child.kill('SIGKILL');
        resolvePromise();
      }, 5_000);
    }),
  ]);
}

async function measureNavigation(
  page: Page,
  url: string,
  {
    priority = 'sync',
    stream,
  }: { priority?: 'sync' | 'transition'; stream: boolean },
) {
  await page.goto(`${url}/?stream=${stream ? '1' : '0'}&priority=${priority}`);
  await page.locator('#heavy-link').waitFor();

  if (stream) {
    await page.waitForFunction(
      () =>
        document.querySelector('#status')?.textContent === 'streaming' &&
        Number(document.querySelector('#message-length')?.textContent) > 20,
    );
  }

  await page.locator('#heavy-link').hover();
  await page.waitForTimeout(500);

  const startedAt = await page.evaluate(() => performance.now());
  await page.locator('#heavy-link').click();
  await page.locator('#heavy-destination').waitFor({ timeout: 10_000 });
  const committedAt = await page.evaluate(() => performance.now());
  return committedAt - startedAt;
}

async function main() {
  await createApp();

  try {
    const nextExecutable = join(
      repositoryRoot,
      'apps',
      'docs',
      'node_modules',
      'next',
      'dist',
      'bin',
      'next',
    );
    await runCommand(nextExecutable, ['build', '--webpack']);

    const port = await getAvailablePort();
    const serverLog = createWriteStream(join(appDirectory, 'server.log'));
    const server = spawn(
      nextExecutable,
      ['start', '--hostname', '127.0.0.1', '--port', String(port)],
      {
        cwd: appDirectory,
        env: {
          ...process.env,
          NEXT_TELEMETRY_DISABLED: '1',
        },
        detached: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    server.stdout?.pipe(serverLog);
    server.stderr?.pipe(serverLog);

    const browser = await chromium.launch({ headless: true });
    try {
      const url = `http://127.0.0.1:${port}`;
      await waitForServer(url, server);

      const page = await browser.newPage();
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

      const controlMs = await measureNavigation(page, url, { stream: false });
      if (controlMs >= MAX_EXPECTED_NAVIGATION_MS) {
        throw new Error(
          `Harness invalid: control navigation took ${Math.round(controlMs)} ms`,
        );
      }

      const transitionStreamingMs = await measureNavigation(page, url, {
        priority: 'transition',
        stream: true,
      });
      if (transitionStreamingMs >= MAX_EXPECTED_NAVIGATION_MS) {
        throw new Error(
          `Harness invalid: transition-priority comparison took ${Math.round(transitionStreamingMs)} ms`,
        );
      }

      const streamingMs = await measureNavigation(page, url, { stream: true });
      console.log(
        JSON.stringify({
          controlNavigationMs: Math.round(controlMs),
          transitionStreamingNavigationMs: Math.round(transitionStreamingMs),
          streamingNavigationMs: Math.round(streamingMs),
        }),
      );

      if (streamingMs >= MAX_EXPECTED_NAVIGATION_MS) {
        throw new Error(
          `${FAILURE_SIGNAL}: ${Math.round(streamingMs)} ms (control ${Math.round(controlMs)} ms)`,
        );
      }
    } finally {
      await browser.close();
      await stopServer(server);
      await new Promise<void>((resolvePromise, reject) => {
        serverLog.once('error', reject);
        serverLog.end(resolvePromise);
      });
    }
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
