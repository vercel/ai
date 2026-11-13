#!/usr/bin/env node

/*
 * Verifies end to end that a chat turn in `examples/durable-harness-e2e-next`
 * survives a crash of the process that drives it:
 *
 * 1. Starts the app's dev server in the background.
 * 2. Opens the app in a headed `agent-browser` session, starts a fresh chat
 *    session and sends a prompt with a long response.
 * 3. Once the response streams, presses the Crash button, which kills the
 *    dev server, and checks that the dev server died.
 * 4. Restarts the dev server, reloads the page, and checks that the chat
 *    picks the turn up again and streams it to the end.
 * 5. Checks that the turn finished, both in the UI and in the session's
 *    stream on the server.
 *
 * It closes the browser session and stops every dev server it started, also
 * when a check fails. It refuses to run while something else listens on the
 * app's port.
 *
 * Usage: `./tools/durable-harness-e2e/test-long-model-stream.mts
 * [--record [path]]`. Must run outside of any sandbox, since it starts a
 * server, a browser, and Vercel Sandboxes. With `--record`, it records the
 * browser session as a video until it closes the browser, saved to
 * `path` (resolved against the current directory) or to `recording.mp4` in
 * the current directory.
 */

import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, openSync, readFileSync } from 'node:fs';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { createBrowserRecording } from './util/browser-recording.mts';
import { browserLaunchArgs } from './util/browser-window.mts';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const appPackage = '@example/durable-harness-e2e-next';
const port = 3000;
const baseUrl = `http://localhost:${port}`;
const browserSession = `durable-crash-recovery-${process.pid}`;
const prompt =
  'Without using any tools, write a story (about 800 words) about a lighthouse keeper who discovers a message in a bottle. Number every paragraph like [1], [2], ...';

const CRASH_AFTER_MS = 5_000;
const SERVER_READY_TIMEOUT_MS = 120_000;
const SERVER_EXIT_TIMEOUT_MS = 30_000;
const RESPONSE_START_TIMEOUT_MS = 120_000;
const PICKUP_TIMEOUT_MS = 120_000;
const TURN_END_TIMEOUT_MS = 600_000;
const POLL_INTERVAL_MS = 1_000;
const BROWSER_COMMAND_TIMEOUT_MS = 60_000;

/**
 * A dev server started by this script, running in its own process group.
 */
type DevServer = {
  child: ChildProcess;
  logPath: string;
  exited: Promise<void>;
  hasExited: () => boolean;
};

/**
 * The chat as the page sees it, read from the session storage the chat
 * writes (`lib/stored-chat-state.ts`, `lib/stored-agent-session.ts`).
 */
type ChatState = {
  chatId?: string;
  runId?: string;
  turnInProgress: boolean;
  roles: string[];
  assistantTextLength: number;
  assistantTextTail: string;
  reconnecting: boolean;
};

const logDir = mkdtempSync(join(tmpdir(), 'durable-crash-recovery-'));
const devServers: DevServer[] = [];
let browserOpened = false;
const recording = createBrowserRecording({ runBrowserCommand: browser, log });

function log(message: string): void {
  console.log(`[verify] ${message}`);
}

function fail(message: string): never {
  throw new Error(message);
}

function isPortInUse(): Promise<boolean> {
  return new Promise(resolve => {
    const socket = connect({ port, host: '127.0.0.1' });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

async function waitFor<T>({
  description,
  timeoutMs,
  check,
}: {
  description: string;
  timeoutMs: number;
  check: () => Promise<T | undefined> | T | undefined;
}): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const result = await check();
    if (result !== undefined) return result;
    if (Date.now() > deadline) {
      fail(`Timed out after ${timeoutMs / 1000}s waiting for ${description}.`);
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

async function startDevServer(): Promise<DevServer> {
  const logPath = join(logDir, `dev-server-${devServers.length + 1}.log`);
  const logFd = openSync(logPath, 'a');
  /*
   * `detached` puts the dev server into a process group of its own, so that
   * stopping it reaches every process `pnpm` starts for it, including the
   * Next.js server process.
   */
  const child = spawn('pnpm', ['--filter', appPackage, 'dev'], {
    cwd: repoRoot,
    detached: true,
    stdio: ['ignore', logFd, logFd],
  });
  let exited = false;
  const server: DevServer = {
    child,
    logPath,
    exited: new Promise(resolve =>
      child.once('exit', () => {
        exited = true;
        resolve();
      }),
    ),
    hasExited: () => exited,
  };
  devServers.push(server);
  log(`Started the dev server (pid ${child.pid}), logging to ${logPath}.`);

  await waitFor({
    description: 'the dev server to serve the app',
    timeoutMs: SERVER_READY_TIMEOUT_MS,
    check: async () => {
      if (server.hasExited()) {
        fail(`The dev server exited while starting. See ${logPath}.`);
      }
      try {
        const response = await fetch(baseUrl);
        return response.ok ? true : undefined;
      } catch {
        return undefined;
      }
    },
  });
  log('The dev server is ready.');
  return server;
}

async function stopDevServer(server: DevServer): Promise<void> {
  const { pid } = server.child;
  if (server.hasExited() || pid == null) return;
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGKILL'] as const) {
    try {
      process.kill(-pid, signal);
    } catch {
      return;
    }
    const stopped = await Promise.race([
      server.exited.then(() => true),
      sleep(10_000).then(() => false),
    ]);
    if (stopped) return;
  }
}

function browser(args: string[], options: { input?: string } = {}): string {
  return execFileSync('agent-browser', ['--session', browserSession, ...args], {
    encoding: 'utf8',
    input: options.input,
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: BROWSER_COMMAND_TIMEOUT_MS,
  }).trim();
}

const readChatStateScript = `(() => {
  const read = prefix => {
    const key = Object.keys(sessionStorage).find(key => key.startsWith(prefix));
    return key == null ? undefined : JSON.parse(sessionStorage.getItem(key));
  };
  const chat = read('durable-harness-chat-state:');
  const session = read('durable-harness-agent-session:');
  const messages = chat?.messages ?? [];
  const last = messages.at(-1);
  const assistantText =
    last?.role === 'assistant'
      ? last.parts.filter(part => part.type === 'text').map(part => part.text).join('')
      : '';
  return JSON.stringify({
    chatId: session?.sessionId,
    runId: session?.runId,
    turnInProgress: chat?.turnInProgress ?? false,
    roles: messages.map(message => message.role),
    assistantTextLength: assistantText.length,
    assistantTextTail: assistantText.slice(-120),
    reconnecting: document.body.innerText.includes('Connection lost'),
  });
})()`;

const chatIdStorageKey = 'durable-harness-pi-basic-chat-id';
const chatReadyExpression = `document.querySelector('[placeholder="Say something..."]') != null`;

/**
 * Waits until the page shows the chat and, if given, holds a chat ID other
 * than `previousChatId`.
 *
 * `wait --load` is not usable here: it waits for the next load event, so on
 * a page that already loaded it only returns after its timeout.
 */
function waitForChat({ previousChatId }: { previousChatId?: string } = {}) {
  const expression =
    previousChatId == null
      ? chatReadyExpression
      : `${chatReadyExpression} && sessionStorage.getItem(${JSON.stringify(chatIdStorageKey)}) !== ${JSON.stringify(previousChatId)}`;
  browser(['wait', '--fn', expression]);
}

function readChatId(): string {
  return JSON.parse(
    browser(['eval', `sessionStorage.getItem(${JSON.stringify(chatIdStorageKey)})`]),
  );
}

/**
 * Reads the chat's state from the page. Returns `undefined` while the page
 * cannot be evaluated, e.g. because it is reloading.
 */
function readChatState(): ChatState | undefined {
  try {
    let value: unknown = JSON.parse(
      browser(['eval', '--stdin'], { input: readChatStateScript }),
    );
    if (typeof value === 'string') value = JSON.parse(value);
    return value as ChatState;
  } catch {
    return undefined;
  }
}

async function verify(): Promise<void> {
  if (await isPortInUse()) {
    fail(
      `Port ${port} is already in use. Stop the server listening there first.`,
    );
  }

  const firstServer = await startDevServer();

  log(`Opening ${baseUrl} in the headed browser session ${browserSession}.`);
  browser([...browserLaunchArgs, 'open', baseUrl]);
  browserOpened = true;
  recording.start();
  waitForChat();
  const previousChatId = readChatId();
  browser(['find', 'role', 'button', 'click', '--name', 'new session']);
  waitForChat({ previousChatId });

  log('Sending the prompt.');
  browser(['find', 'placeholder', 'Say something...', 'fill', prompt]);
  browser(['press', 'Enter']);

  const started = await waitFor({
    description: 'the response to start streaming',
    timeoutMs: RESPONSE_START_TIMEOUT_MS,
    check: () => {
      const state = readChatState();
      return state != null && state.assistantTextLength > 0 ? state : undefined;
    },
  });
  log(
    `The response is streaming (session ${started.chatId}, run ${started.runId}).`,
  );

  await sleep(CRASH_AFTER_MS);
  const beforeCrash = readChatState();
  if (beforeCrash?.turnInProgress !== true) {
    fail('The turn finished before the crash. Use a longer prompt.');
  }
  log(
    `Pressing Crash with ${beforeCrash.assistantTextLength} characters of the response shown.`,
  );
  browser(['find', 'role', 'button', 'click', '--name', 'Crash']);

  const crashed = await Promise.race([
    firstServer.exited.then(() => true),
    sleep(SERVER_EXIT_TIMEOUT_MS).then(() => false),
  ]);
  if (!crashed) {
    fail(
      `The dev server did not crash within ${SERVER_EXIT_TIMEOUT_MS / 1000}s. See ${firstServer.logPath}.`,
    );
  }
  await waitFor({
    description: `port ${port} to be released`,
    timeoutMs: SERVER_EXIT_TIMEOUT_MS,
    check: async () => ((await isPortInUse()) ? undefined : true),
  });
  log('The dev server crashed.');

  const afterCrash = readChatState();
  if (afterCrash == null || afterCrash.assistantTextLength === 0) {
    fail('The page lost the partial response after the crash.');
  }
  log(
    `The page keeps ${afterCrash.assistantTextLength} characters of the response${afterCrash.reconnecting ? ' and is reconnecting' : ''}.`,
  );

  const secondServer = await startDevServer();

  log('Reloading the page.');
  browser(['reload']);
  waitForChat();

  const pickedUp = await waitFor({
    description: 'the page to pick up the turn again',
    timeoutMs: PICKUP_TIMEOUT_MS,
    check: () => {
      const state = readChatState();
      return state != null && state.assistantTextLength > 0 ? state : undefined;
    },
  });
  log(
    `The page picked up the turn (${pickedUp.assistantTextLength} characters, ${pickedUp.turnInProgress ? 'still streaming' : 'already finished'}).`,
  );

  let lastLength = pickedUp.assistantTextLength;
  const finished = await waitFor({
    description: 'the turn to finish',
    timeoutMs: TURN_END_TIMEOUT_MS,
    check: () => {
      const state = readChatState();
      if (state == null) return undefined;
      if (state.assistantTextLength !== lastLength) {
        lastLength = state.assistantTextLength;
        log(`  ... ${lastLength} characters`);
      }
      return !state.turnInProgress && !state.reconnecting ? state : undefined;
    },
  });

  if (finished.roles.join(',') !== 'user,assistant') {
    fail(
      `Expected one user and one assistant message, got: ${finished.roles.join(', ')}.`,
    );
  }
  if (finished.assistantTextLength === 0) {
    fail('The finished turn has no response text.');
  }
  log(
    `The turn finished in the UI with ${finished.assistantTextLength} characters, ending with: ${JSON.stringify(finished.assistantTextTail)}`,
  );

  if (finished.chatId == null || finished.runId == null) {
    fail('The page does not hold the agent session.');
  }
  const replay = await (
    await fetch(
      `${baseUrl}/api/chat/${encodeURIComponent(finished.chatId)}/stream?runId=${encodeURIComponent(finished.runId)}`,
    )
  ).text();
  const count = (type: string) => replay.split(`"type":"${type}"`).length - 1;
  if (count('finish') !== 1) {
    fail('The replay of the turn on the server does not end with `finish`.');
  }
  log(
    `The server's replay of the turn finished (${count('text-start')} text parts, ${count('reset-step')} reset-step).`,
  );

  const recoveryLogged = readFileSync(secondServer.logPath, 'utf8').includes(
    finished.runId,
  );
  log(
    recoveryLogged
      ? 'The restarted dev server ran a recovery drive for the session.'
      : 'The restarted dev server did not log a recovery drive for the session.',
  );
}

async function cleanUp(): Promise<void> {
  if (browserOpened) {
    recording.stop();
    try {
      browser(['close']);
    } catch {}
  }
  for (const server of devServers) await stopDevServer(server);
}

process.once('SIGINT', () => {
  void cleanUp().finally(() => process.exit(130));
});

try {
  await verify();
  log('PASSED: the turn survived the crash.');
} catch (error) {
  console.error(
    `[verify] FAILED: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
} finally {
  await cleanUp();
  log(`Dev server logs: ${logDir}`);
}
