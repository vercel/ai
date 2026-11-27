#!/usr/bin/env node

/*
 * Verifies end to end that queued follow-up prompts in
 * `examples/durable-harness-e2e-next` continue the running stream across turns
 * and survive a crash before the queued turn starts:
 *
 * 1. Starts the app's dev server in the background.
 * 2. Opens the app in a headed `agent-browser` session, starts a fresh chat
 *    session, and sends Prompt 1.
 * 3. While Turn 1 is still streaming, queues Prompt 2 via the Queue button.
 * 4. Waits until Prompt 2 is delivered and Turn 2 starts streaming on the same
 *    stream (`harness.start-turn` count reaches 2).
 * 5. While Turn 2 is still streaming, queues Prompt 3 via the Queue button,
 *    waits for the queue request to commit, and then presses Crash.
 * 6. Restarts the dev server, reloads the page, and waits for recovery to
 *    finish Turn 2 and run Turn 3.
 * 7. Checks that the UI and the server's stream replay end with `finish` and
 *    contain Prompt 3's marker token.
 *
 * It closes the browser session and stops every dev server it started, also
 * when a check fails. It refuses to run while something else listens on the
 * app's port.
 *
 * Usage: `./tools/durable-harness-e2e/test-queued-prompts.mts
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
import { mkdtempSync, openSync, readFileSync } from 'node:fs';
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
const browserSession = `durable-queued-prompts-${process.pid}`;

const prompt1 =
  'Without using any tools, write a story (about 300 words) about a lighthouse keeper who discovers a message in a bottle. Number every paragraph like [1], [2], ...';
const prompt2 =
  'Without using any tools, write a detailed story (about 700 words) about a mountain climber navigating a sudden blizzard. Number every paragraph like [1], [2], ...';
const turn3Token = 'READY';
const prompt3 = `Without using any tools, reply with the single word ${turn3Token}.`;

const SERVER_READY_TIMEOUT_MS = 120_000;
const SERVER_EXIT_TIMEOUT_MS = 30_000;
const RESPONSE_START_TIMEOUT_MS = 120_000;
const SECOND_TURN_TIMEOUT_MS = 180_000;
const QUEUE_COMMIT_TIMEOUT_MS = 30_000;
const PICKUP_TIMEOUT_MS = 120_000;
const TURN_END_TIMEOUT_MS = 600_000;
const KEEP_OPEN_AFTER_TURN_MS = 5_000;
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
  assistantText: string;
  assistantTextLength: number;
  startTurnCount: number;
  finishTurnCount: number;
  latestTurnTextLength: number;
  queuedPromptCount: number;
  deliveredPromptCount: number;
  assistantTurnTexts: string[];
  bodyText: string;
  queueing: boolean;
  alertMessage?: string;
  reconnecting: boolean;
};

const logDir = mkdtempSync(join(tmpdir(), 'durable-queued-prompts-'));
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
  const parts = last?.role === 'assistant' ? last.parts : [];
  const assistantText = parts
    .filter(part => part.type === 'text')
    .map(part => part.text)
    .join('');
  let startTurnCount = 0;
  let finishTurnCount = 0;
  let latestTurnStartIndex = -1;
  parts.forEach((part, index) => {
    if (part.type === 'custom' && part.kind === 'harness.start-turn') {
      startTurnCount++;
      latestTurnStartIndex = index;
    }
    if (part.type === 'custom' && part.kind === 'harness.finish-turn') {
      finishTurnCount++;
    }
  });
  const latestTurnTextLength =
    latestTurnStartIndex === -1
      ? 0
      : parts
          .slice(latestTurnStartIndex + 1)
          .filter(part => part.type === 'text')
          .map(part => part.text)
          .join('').length;
  const assistantTurnTexts = [];
  for (const message of messages) {
    if (message.role !== 'assistant') continue;
    let currentText = '';
    let seenStart = false;
    for (const part of message.parts) {
      if (part.type === 'custom' && part.kind === 'harness.start-turn') {
        if (seenStart) {
          assistantTurnTexts.push(currentText);
          currentText = '';
        }
        seenStart = true;
      } else if (part.type === 'text') {
        currentText += part.text;
      }
    }
    if (currentText.length > 0 || seenStart) {
      assistantTurnTexts.push(currentText);
    }
  }
  const alertEl = document.querySelector('[role="alert"]');
  return JSON.stringify({
    chatId: session?.sessionId,
    runId: session?.runId,
    turnInProgress: chat?.turnInProgress ?? false,
    roles: messages.map(message => message.role),
    assistantText,
    assistantTextLength: assistantText.length,
    startTurnCount,
    finishTurnCount,
    latestTurnTextLength,
    queuedPromptCount: document.querySelectorAll('[data-queued-prompt="true"]').length,
    deliveredPromptCount: document.querySelectorAll('[data-delivered-prompt="true"]').length,
    assistantTurnTexts,
    bodyText: document.body.innerText,
    queueing: document.querySelector('[data-queueing="true"]') != null,
    alertMessage: alertEl?.textContent ?? undefined,
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
 * Fills the chat input and clicks the Queue button, then waits for the queue
 * request to finish so the submission is committed in the session's log.
 */
async function queuePrompt({
  prompt,
  label,
}: {
  prompt: string;
  label: string;
}): Promise<void> {
  log(`Queueing ${label}.`);
  browser(['find', 'placeholder', 'Say something...', 'fill', prompt]);
  browser(['find', 'role', 'button', 'click', '--name', 'Queue']);
  const state = await waitFor({
    description: `${label} queue request to finish`,
    timeoutMs: QUEUE_COMMIT_TIMEOUT_MS,
    check: () => {
      const current = readChatState();
      return current != null && !current.queueing ? current : undefined;
    },
  });
  if (state.alertMessage != null) {
    fail(`Queueing ${label} failed with alert: ${state.alertMessage}`);
  }
}

async function verify(): Promise<void> {
  const harness = parseHarnessArg();
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
  const harnessId = await startNewSession({
    runBrowserCommand: browser,
    harness,
    log,
  });

  log('Sending Prompt 1.');
  browser(['find', 'placeholder', 'Say something...', 'fill', prompt1]);
  browser(['press', 'Enter']);

  const started = await waitFor({
    description: 'Turn 1 to start streaming',
    timeoutMs: RESPONSE_START_TIMEOUT_MS,
    check: () => {
      const state = readChatState();
      return state != null && state.assistantTextLength > 0 ? state : undefined;
    },
  });
  if (!started.turnInProgress) {
    fail('Turn 1 finished before Prompt 2 could be queued.');
  }
  log(
    `Turn 1 is streaming (session ${started.chatId}, run ${started.runId}, ${started.assistantTextLength} chars).`,
  );

  await queuePrompt({ prompt: prompt2, label: 'Prompt 2' });
  const afterQueue2 = readChatState();
  if (
    afterQueue2 == null ||
    (afterQueue2.queuedPromptCount === 0 &&
      afterQueue2.deliveredPromptCount === 0)
  ) {
    fail('Prompt 2 did not appear in the UI after queueing.');
  }

  const turn2 = await waitFor({
    description: 'Turn 2 to start streaming on the same stream',
    timeoutMs: SECOND_TURN_TIMEOUT_MS,
    check: () => {
      const state = readChatState();
      return state != null &&
        state.startTurnCount >= 2 &&
        state.latestTurnTextLength > 0 &&
        state.deliveredPromptCount >= 1 &&
        state.queuedPromptCount === 0
        ? state
        : undefined;
    },
  });
  if (!turn2.turnInProgress) {
    fail('Turn 2 finished before Prompt 3 could be queued and crashed.');
  }
  log(
    `Turn 2 is streaming on the same stream (startTurnCount=${turn2.startTurnCount}, finishTurnCount=${turn2.finishTurnCount}, deliveredPromptCount=${turn2.deliveredPromptCount}, latestTurnTextLength=${turn2.latestTurnTextLength}).`,
  );

  await queuePrompt({ prompt: prompt3, label: 'Prompt 3' });

  const beforeCrash = readChatState();
  if (beforeCrash?.turnInProgress !== true) {
    fail('Turn 2 finished before Crash was pressed. Use a longer Prompt 2.');
  }
  if (beforeCrash.queuedPromptCount === 0) {
    fail('Prompt 3 did not appear as queued in the UI before Crash.');
  }
  log(
    `Pressing Crash during Turn 2 with Prompt 3 queued (${beforeCrash.assistantTextLength} chars shown).`,
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

  const secondServer = await startDevServer();

  log('Reloading the page.');
  browser(['reload']);
  waitForChat();

  const pickedUp = await waitFor({
    description: 'the page to pick up the session after reload',
    timeoutMs: PICKUP_TIMEOUT_MS,
    check: () => {
      const state = readChatState();
      return state != null && state.assistantTextLength > 0 ? state : undefined;
    },
  });
  log(
    `The page picked up the session (${pickedUp.assistantTextLength} chars, ${pickedUp.turnInProgress ? 'still streaming' : 'already finished'}).`,
  );

  let lastLength = pickedUp.assistantTextLength;
  const finished = await waitFor({
    description: 'Turn 2 and queued Turn 3 to finish after recovery',
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
      `Expected one user message and one multi-turn assistant message after recovery, got roles: ${finished.roles.join(', ')}.`,
    );
  }
  if (finished.assistantTurnTexts.length !== 3) {
    fail(
      `Expected 3 assistant turns in the UI after recovery, got ${finished.assistantTurnTexts.length}.`,
    );
  }
  if (
    finished.assistantTurnTexts[0]!.length === 0 ||
    finished.assistantTurnTexts[1]!.length === 0 ||
    !finished.assistantTurnTexts[2]!.includes(turn3Token)
  ) {
    fail(
      `Expected Turn 1 and Turn 2 text plus Turn 3 containing ${JSON.stringify(turn3Token)}, got turn lengths: ${finished.assistantTurnTexts.map(text => text.length).join(', ')}.`,
    );
  }
  const p1Index = finished.bodyText.indexOf(prompt1);
  const p2Index = finished.bodyText.indexOf(prompt2);
  const p3Index = finished.bodyText.indexOf(prompt3);
  const t3Index = finished.bodyText.indexOf(
    turn3Token,
    p3Index + prompt3.length,
  );
  if (
    p1Index === -1 ||
    p2Index <= p1Index ||
    p3Index <= p2Index ||
    t3Index <= p3Index
  ) {
    fail(
      `Expected all 3 prompts and Turn 3 response in order in the UI (indices: p1=${p1Index}, p2=${p2Index}, p3=${p3Index}, t3=${t3Index}).`,
    );
  }
  if (finished.queuedPromptCount !== 0 || finished.deliveredPromptCount !== 2) {
    fail(
      `Expected both follow-up prompts to render as delivered steering-message parts after recovery, got queuedPromptCount=${finished.queuedPromptCount}, deliveredPromptCount=${finished.deliveredPromptCount}.`,
    );
  }
  log(
    `All 3 turns are intact in the UI after recovery (turn lengths: ${finished.assistantTurnTexts.map(text => text.length).join(', ')}; Turn 3 includes ${turn3Token}).`,
  );

  if (finished.chatId == null || finished.runId == null) {
    fail('The page does not hold the agent session.');
  }
  const replay = await (
    await fetch(
      `${baseUrl}/api/harness/${harnessId}/basic/chat/${encodeURIComponent(finished.chatId)}/stream?runId=${encodeURIComponent(finished.runId)}`,
    )
  ).text();
  const count = (type: string) => replay.split(`"type":"${type}"`).length - 1;
  if (count('finish') !== 1) {
    fail('The server replay does not end with a single `finish` part.');
  }
  if (!replay.includes(turn3Token)) {
    fail(
      `The server replay does not contain ${JSON.stringify(turn3Token)} from the queued third turn.`,
    );
  }
  log(
    `The server replay finished cleanly with ${turn3Token} (${count('text-start')} text parts, ${count('reset-step')} reset-step).`,
  );

  const recoveryLogged = readFileSync(secondServer.logPath, 'utf8').includes(
    finished.runId,
  );
  log(
    recoveryLogged
      ? 'The restarted dev server ran a recovery drive for the session.'
      : 'The restarted dev server did not log a recovery drive for the session.',
  );

  await sleep(KEEP_OPEN_AFTER_TURN_MS);
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
  log(
    'PASSED: queued follow-up prompts continued the stream and survived crash.',
  );
} catch (error) {
  console.error(
    `[verify] FAILED: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
} finally {
  await cleanUp();
  log(`Dev server logs: ${logDir}`);
}
