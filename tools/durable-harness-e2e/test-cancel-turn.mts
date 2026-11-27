#!/usr/bin/env node

/*
 * Verifies end to end that a running chat turn in
 * `examples/durable-harness-e2e-next` can be cancelled, and that the session
 * continues normally afterwards:
 *
 * 1. Starts the app's dev server in the background.
 * 2. Opens the app in a headed `agent-browser` session, starts a fresh chat
 *    session and sends a prompt with a long response.
 * 3. Once the response streams, presses the Cancel button.
 * 4. Checks that the turn ends within a minute and that its response text
 *    stops growing.
 * 5. Checks that the session's stream on the server ends the turn with one
 *    `finish` part whose finish reason is `other`.
 * 6. Sends a follow-up prompt and checks that it gets a response.
 *
 * It closes the browser session and stops every dev server it started, also
 * when a check fails. It refuses to run while something else listens on the
 * app's port.
 *
 * Usage: `./tools/durable-harness-e2e/test-cancel-turn.mts
 * [--harness <id>] [--record [path]]`. Must run outside of any sandbox,
 * since it starts a server, a browser, and Vercel Sandboxes. With
 * `--harness`, it starts the session on the harness of
 * `packages/harness-<id>-v2` (e.g. `pi` or `fx`), and otherwise on the
 * harness the new session dialog preselects. With `--record`, it records the
 * browser session as a video until it closes the browser, saved to
 * `path` (resolved against the current directory) or to `recording.mp4` in
 * the current directory.
 */

import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, openSync } from 'node:fs';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { createBrowserRecording } from './util/browser-recording.mts';
import { browserLaunchArgs } from './util/browser-window.mts';
import { parseHarnessArg, startNewSession } from './util/new-session.mts';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const appPackage = '@example/durable-harness-e2e-next';
const port = 3000;
const baseUrl = `http://localhost:${port}`;
const browserSession = `durable-cancel-turn-${process.pid}`;
const prompt =
  'Without using any tools, write a story (about 800 words) about a lighthouse keeper who discovers a message in a bottle. Number every paragraph like [1], [2], ...';
const followUpPrompt = 'Reply with the single word READY.';

const CANCEL_AFTER_MS = 5_000;
const KEEP_OPEN_AFTER_TURN_MS = 5_000;
const SERVER_READY_TIMEOUT_MS = 120_000;
const RESPONSE_START_TIMEOUT_MS = 120_000;
const CANCEL_TIMEOUT_MS = 60_000;
const SETTLED_CHECK_MS = 5_000;
const TURN_END_TIMEOUT_MS = 300_000;
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

const logDir = mkdtempSync(join(tmpdir(), 'durable-cancel-turn-'));
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

const chatReadyExpression = `document.querySelector('[placeholder="Say something..."]') != null`;

/**
 * Waits until the page shows the chat.
 *
 * `wait --load` is not usable here: it waits for the next load event, so on
 * a page that already loaded it only returns after its timeout.
 */
function waitForChat() {
  browser(['wait', '--fn', chatReadyExpression]);
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

/**
 * Waits until the turn the page shows ended, i.e. it is neither in progress
 * nor reconnecting.
 */
function waitForTurnEnd(options: {
  description: string;
  timeoutMs: number;
}): Promise<ChatState> {
  return waitFor({
    description: options.description,
    timeoutMs: options.timeoutMs,
    check: () => {
      const state = readChatState();
      return state != null && !state.turnInProgress && !state.reconnecting
        ? state
        : undefined;
    },
  });
}

async function verify(): Promise<void> {
  const harness = parseHarnessArg();
  if (await isPortInUse()) {
    fail(
      `Port ${port} is already in use. Stop the server listening there first.`,
    );
  }

  await startDevServer();

  log(`Opening ${baseUrl} in the headed browser session ${browserSession}.`);
  browser([...browserLaunchArgs, 'open', baseUrl]);
  browserOpened = true;
  recording.start();
  waitForChat();
  const harnessId = await startNewSession({
    runBrowserCommand: browser,
    harness,
    log,
  });

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

  await sleep(CANCEL_AFTER_MS);
  const beforeCancel = readChatState();
  if (beforeCancel?.turnInProgress !== true) {
    fail('The turn finished before the cancel. Use a longer prompt.');
  }
  log(
    `Pressing Cancel with ${beforeCancel.assistantTextLength} characters of the response shown.`,
  );
  browser(['find', 'role', 'button', 'click', '--name', 'Cancel']);

  const ended = await waitForTurnEnd({
    description: 'the cancelled turn to end',
    timeoutMs: CANCEL_TIMEOUT_MS,
  });
  log(
    `The turn ended with ${ended.assistantTextLength} characters of the response, ending with: ${JSON.stringify(ended.assistantTextTail)}`,
  );
  if (ended.assistantTextLength === 0) {
    fail('The page lost the partial response of the cancelled turn.');
  }

  await sleep(SETTLED_CHECK_MS);
  const settled = readChatState();
  if (settled?.assistantTextLength !== ended.assistantTextLength) {
    fail(
      `The response kept growing after the turn ended (${ended.assistantTextLength} -> ${settled?.assistantTextLength} characters).`,
    );
  }
  if (settled.roles.join(',') !== 'user,assistant') {
    fail(
      `Expected one user and one assistant message, got: ${settled.roles.join(', ')}.`,
    );
  }

  if (ended.chatId == null || ended.runId == null) {
    fail('The page does not hold the agent session.');
  }
  const replay = await (
    await fetch(
      `${baseUrl}/api/harness/${harnessId}/basic/chat/${encodeURIComponent(ended.chatId)}/stream?runId=${encodeURIComponent(ended.runId)}`,
    )
  ).text();
  const count = (text: string) => replay.split(text).length - 1;
  if (count('"type":"finish"') !== 1) {
    fail('The replay of the turn on the server does not end with `finish`.');
  }
  if (count('"finishReason":"other"') !== 1) {
    fail(
      'The `finish` part of the turn on the server does not have the finish reason `other`.',
    );
  }
  log("The server's replay of the turn finished with finish reason `other`.");

  log('Sending a follow-up prompt.');
  browser(['find', 'placeholder', 'Say something...', 'fill', followUpPrompt]);
  browser(['press', 'Enter']);
  await waitFor({
    description: 'the follow-up turn to start',
    timeoutMs: RESPONSE_START_TIMEOUT_MS,
    check: () => {
      const state = readChatState();
      return state != null && state.roles.length === 4 ? state : undefined;
    },
  });
  const followUp = await waitForTurnEnd({
    description: 'the follow-up turn to finish',
    timeoutMs: TURN_END_TIMEOUT_MS,
  });

  log(
    `The follow-up turn finished. Keeping the page open for ${KEEP_OPEN_AFTER_TURN_MS / 1000}s.`,
  );
  await sleep(KEEP_OPEN_AFTER_TURN_MS);

  if (followUp.roles.join(',') !== 'user,assistant,user,assistant') {
    fail(
      `Expected two user and two assistant messages, got: ${followUp.roles.join(', ')}.`,
    );
  }
  if (followUp.assistantTextLength === 0) {
    fail('The follow-up turn has no response text.');
  }
  log(
    `The follow-up turn finished with: ${JSON.stringify(followUp.assistantTextTail)}`,
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
  log('PASSED: the turn was cancelled and the session continued.');
} catch (error) {
  console.error(
    `[verify] FAILED: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
} finally {
  await cleanUp();
  log(`Dev server logs: ${logDir}`);
}
