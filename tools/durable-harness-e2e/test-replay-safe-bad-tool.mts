#!/usr/bin/env node

/*
 * Verifies end to end that a chat turn in `examples/durable-harness-e2e-next`
 * survives crashes caused by one of the agent's own tools, `addNote`
 * (`lib/add-note-tool.ts`), which kills the process that runs it with a 70%
 * chance per call. The tool is replay-safe, so recovery runs an interrupted
 * call again, which may crash again, until one gets through:
 *
 * 1. Starts the app's dev server in the background.
 * 2. Opens the app in a headed `agent-browser` session, starts a fresh chat
 *    session and sends a prompt that asks to write a haiku with `addNote`
 *    and to read the note back.
 * 3. Waits until the dev server crashed or the turn finished, without
 *    pressing Crash.
 * 4. After each crash, restarts the dev server, reloads the page, waits
 *    until the chat picks the turn up again, and goes back to step 3. The
 *    dev server's startup recovery drive runs the interrupted call again
 *    right away, so a dev server that crashes while starting counts as the
 *    next crash. It gives up after `MAX_CRASHES` crashes, which with a 70%
 *    crash chance per call is very unlikely to happen by chance.
 * 5. Waits until the turn finished in the UI, keeps the page open for
 *    another 5s, then checks that an `addNote` call succeeded, that a tool
 *    call afterwards (to read the note back) succeeded too, that the agent
 *    wrote a response, and that the turn also finished in the session's
 *    stream on the server.
 *
 * It closes the browser session and stops every dev server it started, also
 * when a check fails. It refuses to run while something else listens on the
 * app's port.
 *
 * Usage: `./tools/durable-harness-e2e/test-replay-safe-bad-tool.mts
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
const browserSession = `durable-crash-recovery-replay-safe-bad-tool-${process.pid}`;
const prompt =
  'Use the `addNote` tool to write a haiku about AI, then read back the file contents.';

const MAX_CRASHES = 20;
const KEEP_OPEN_AFTER_TURN_MS = 5_000;
const SERVER_READY_TIMEOUT_MS = 120_000;
const SERVER_EXIT_TIMEOUT_MS = 30_000;
const RESPONSE_START_TIMEOUT_MS = 120_000;
const PICKUP_TIMEOUT_MS = 120_000;
const TURN_END_TIMEOUT_MS = 600_000;
const POLL_INTERVAL_MS = 1_000;
const BROWSER_COMMAND_TIMEOUT_MS = 60_000;
const PAGE_LOAD_TIMEOUT_MS = 20_000;
const SERVER_CRASH_GRACE_MS = 2_000;

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
  /**
   * The tool parts of the response, in order.
   */
  toolParts: Array<{
    type: string;
    toolCallId: string;
    state: string;
    preliminary?: boolean;
    output?: unknown;
    errorText?: string;
  }>;
  /**
   * The text of the response after its last tool part.
   */
  textAfterTools: string;
};

const logDir = mkdtempSync(
  join(tmpdir(), 'durable-crash-recovery-replay-safe-bad-tool-'),
);
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

/**
 * Starts the dev server and waits until it serves the app. With
 * `exitIsCrash`, a dev server that exits while starting is returned as is
 * instead of failing: the recovery drive that starts with the dev server
 * runs an interrupted `addNote` call again, which may crash it again.
 */
async function startDevServer({
  exitIsCrash = false,
}: { exitIsCrash?: boolean } = {}): Promise<DevServer> {
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
        if (exitIsCrash) return true;
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
  log(
    server.hasExited()
      ? 'The dev server crashed while starting.'
      : 'The dev server is ready.',
  );
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

function browser(
  args: string[],
  options: { input?: string; timeoutMs?: number } = {},
): string {
  return execFileSync('agent-browser', ['--session', browserSession, ...args], {
    encoding: 'utf8',
    input: options.input,
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: options.timeoutMs ?? BROWSER_COMMAND_TIMEOUT_MS,
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
  const isToolPart = part => part.type.startsWith('tool-');
  const lastToolIndex = parts.findLastIndex(isToolPart);
  return JSON.stringify({
    chatId: session?.sessionId,
    runId: session?.runId,
    turnInProgress: chat?.turnInProgress ?? false,
    roles: messages.map(message => message.role),
    assistantTextLength: assistantText.length,
    assistantTextTail: assistantText.slice(-120),
    reconnecting: document.body.innerText.includes('Connection lost'),
    toolParts: parts
      .filter(isToolPart)
      .map(part => ({
        type: part.type,
        toolCallId: part.toolCallId,
        state: part.state,
        preliminary: part.preliminary,
        output: part.type === 'tool-addNote' ? part.output : undefined,
        errorText: part.errorText,
      })),
    textAfterTools:
      lastToolIndex === -1
        ? ''
        : parts
            .slice(lastToolIndex + 1)
            .filter(part => part.type === 'text')
            .map(part => part.text)
            .join(''),
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

/**
 * Returns whether the dev server exited, waiting briefly for its exit to be
 * reported: browser commands block this process while they run, so a crash
 * during one is only noticed afterwards.
 */
async function hasCrashed(server: DevServer): Promise<boolean> {
  return Promise.race([
    server.exited.then(() => true),
    sleep(SERVER_CRASH_GRACE_MS).then(() => false),
  ]);
}

/**
 * Loads the app in the browser session and waits until it shows the chat.
 * Navigates to the app's URL instead of reloading, which also works from
 * the browser's error page after a load hit a dead dev server.
 */
function loadChat(): void {
  const firstLoad = !browserOpened;
  browser([...(firstLoad ? browserLaunchArgs : []), 'open', baseUrl], {
    timeoutMs: PAGE_LOAD_TIMEOUT_MS,
  });
  browserOpened = true;
  if (firstLoad) recording.start();
  waitForChat();
}

/**
 * Waits until the dev server exits, e.g. because the agent's `addNote` tool
 * killed it, or until the turn finishes in the UI. While waiting, logs the
 * tool parts the page shows.
 */
async function waitForCrashOrTurnEnd({
  server,
  timeoutMs,
}: {
  server: DevServer;
  timeoutMs: number;
}): Promise<{ crashed: true } | { crashed: false; state: ChatState }> {
  let lastToolSummary = '';
  return waitFor({
    description: 'the dev server to crash or the turn to finish',
    timeoutMs,
    check: () => {
      if (server.hasExited()) return { crashed: true } as const;
      const state = readChatState();
      if (state == null) return undefined;
      const summary = JSON.stringify(state.toolParts);
      if (summary !== lastToolSummary && state.toolParts.length > 0) {
        lastToolSummary = summary;
        log(`  tool parts: ${summary}`);
      }
      return !state.turnInProgress && !state.reconnecting
        ? ({ crashed: false, state } as const)
        : undefined;
    },
  });
}

/**
 * After the dev server crashed: waits until its port is released, restarts
 * it, reloads the page and waits until the page picked up the turn again.
 */
async function recover({
  crashNumber,
}: {
  crashNumber: number;
}): Promise<DevServer> {
  const label = `Crash ${crashNumber}`;
  await waitFor({
    description: `port ${port} to be released`,
    timeoutMs: SERVER_EXIT_TIMEOUT_MS,
    check: async () => ((await isPortInUse()) ? undefined : true),
  });
  const afterCrash = readChatState();
  log(
    `${label}: the dev server crashed. The page shows ${afterCrash?.toolParts.length ?? 0} tool part(s)${afterCrash?.reconnecting ? ' and is reconnecting' : ''}.`,
  );

  const server = await startDevServer({ exitIsCrash: true });
  if (server.hasExited()) return server;

  /*
   * The dev server's startup recovery drive runs the interrupted call again
   * in the background, so the dev server may crash again at any point while
   * the page reloads and picks up the turn. That is the next crash, which
   * the caller recovers from in turn.
   */
  log(`${label}: reloading the page.`);
  try {
    loadChat();
  } catch (error) {
    if (await hasCrashed(server)) {
      log(`${label}: the dev server crashed again while the page reloaded.`);
      return server;
    }
    throw error;
  }

  const pickedUp = await waitFor({
    description: 'the page to pick up the turn again',
    timeoutMs: PICKUP_TIMEOUT_MS,
    check: () => {
      if (server.hasExited()) return 'crashed' as const;
      const state = readChatState();
      return state != null && state.roles.at(-1) === 'assistant'
        ? state
        : undefined;
    },
  });
  if (pickedUp === 'crashed') {
    log(`${label}: the dev server crashed again before the page picked up the turn.`);
    return server;
  }
  log(
    `${label}: the page picked up the turn (${pickedUp.assistantTextLength} characters, ${pickedUp.turnInProgress ? 'still streaming' : 'already finished'}).`,
  );
  return server;
}

async function verify(): Promise<void> {
  if (await isPortInUse()) {
    fail(
      `Port ${port} is already in use. Stop the server listening there first.`,
    );
  }

  /*
   * The dev server's startup recovery also drives sessions that an earlier
   * run left unfinished, e.g. after a failed check, and their interrupted
   * `addNote` calls may crash it while starting or while the page opens.
   * Restarting it lets those sessions finish too.
   */
  let server: DevServer;
  for (let attempt = 1; ; attempt++) {
    if (attempt > MAX_CRASHES) {
      fail(`The dev server crashed ${MAX_CRASHES} times before the prompt.`);
    }
    server = await startDevServer({ exitIsCrash: true });
    try {
      if (server.hasExited()) throw new Error('crashed while starting');
      log(`Opening ${baseUrl} in the headed browser session ${browserSession}.`);
      loadChat();
      const previousChatId = readChatId();
      browser(['find', 'role', 'button', 'click', '--name', 'new session']);
      waitForChat({ previousChatId });
      break;
    } catch (error) {
      if (!(await hasCrashed(server))) throw error;
      log(
        'The dev server crashed before the prompt, probably while recovering a session that an earlier run left unfinished. Restarting it.',
      );
    }
  }

  log('Sending the prompt.');
  browser(['find', 'placeholder', 'Say something...', 'fill', prompt]);
  browser(['press', 'Enter']);

  const started = await waitFor({
    description: 'the response to start streaming',
    timeoutMs: RESPONSE_START_TIMEOUT_MS,
    check: () => {
      if (server.hasExited()) return 'crashed' as const;
      const state = readChatState();
      return state != null && state.roles.at(-1) === 'assistant'
        ? state
        : undefined;
    },
  });
  log(
    started === 'crashed'
      ? 'The dev server crashed before the response started.'
      : `The response is streaming (session ${started.chatId}, run ${started.runId}). Waiting for crashes or the end of the turn.`,
  );

  const restartedServers: DevServer[] = [];
  let finished: ChatState | undefined;
  for (let crashNumber = 1; finished == null; crashNumber++) {
    const outcome = await waitForCrashOrTurnEnd({
      server,
      timeoutMs: TURN_END_TIMEOUT_MS,
    });
    if (!outcome.crashed) {
      log(
        crashNumber === 1
          ? 'The turn finished without a crash: every addNote call got through on its first try.'
          : `The turn finished after ${crashNumber - 1} crash(es).`,
      );
      finished = outcome.state;
      break;
    }
    if (crashNumber > MAX_CRASHES) {
      fail(
        `The dev server crashed ${crashNumber} times, more than the ${MAX_CRASHES} that are plausible with a 70% crash chance per addNote call.`,
      );
    }
    server = await recover({ crashNumber });
    restartedServers.push(server);
  }

  log(
    `The turn finished. Keeping the page open for ${KEEP_OPEN_AFTER_TURN_MS / 1000}s.`,
  );
  await sleep(KEEP_OPEN_AFTER_TURN_MS);

  if (finished.roles.join(',') !== 'user,assistant') {
    fail(
      `Expected one user and one assistant message, got: ${finished.roles.join(', ')}.`,
    );
  }
  log(`The response's tool parts: ${JSON.stringify(finished.toolParts)}`);
  const succeededAddNoteIndex = finished.toolParts.findIndex(
    part =>
      part.type === 'tool-addNote' &&
      part.state === 'output-available' &&
      part.preliminary !== true,
  );
  if (succeededAddNoteIndex === -1) {
    fail('The finished response has no successful addNote call.');
  }
  const readBackParts = finished.toolParts
    .slice(succeededAddNoteIndex + 1)
    .filter(part => part.type !== 'tool-addNote');
  if (readBackParts.length === 0) {
    fail(
      'The agent did not use any tool after the successful addNote call to read the note back.',
    );
  }
  log(
    `After the successful addNote call, the agent used: ${readBackParts.map(part => `${part.type} (${part.state})`).join(', ')}.`,
  );
  if (!readBackParts.some(part => part.state === 'output-available')) {
    fail(
      `No tool call after the successful addNote call succeeded, so the agent could not read the note back: ${readBackParts.map(part => part.errorText ?? part.state).join('; ')}`,
    );
  }
  if (finished.textAfterTools.trim() === '') {
    fail('The response has no text after its tool calls.');
  }
  log(
    `After its tool calls, the agent wrote: ${JSON.stringify(finished.textAfterTools)}`,
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
    `The server's replay of the turn finished (${count('text-start')} text parts, ${count('tool-input-available')} tool calls, ${count('tool-output-error')} tool errors, ${count('reset-step')} reset-step).`,
  );

  restartedServers.forEach((restartedServer, index) => {
    const recoveryLogged = readFileSync(
      restartedServer.logPath,
      'utf8',
    ).includes(finished.runId!);
    log(
      `The dev server restarted after crash ${index + 1} ${recoveryLogged ? 'ran' : 'did not log'} a recovery drive for the session.`,
    );
  });
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
  log('PASSED: the turn survived the crashes caused by the replay-safe addNote tool.');
} catch (error) {
  console.error(
    `[verify] FAILED: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
} finally {
  await cleanUp();
  log(`Dev server logs: ${logDir}`);
}
