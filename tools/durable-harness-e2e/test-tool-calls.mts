#!/usr/bin/env node

/*
 * Verifies end to end that a chat turn in `examples/durable-harness-e2e-next`
 * that makes several model calls, with a bash tool call between each of
 * them, survives repeated crashes of the process that drives it, and that
 * recovery only repeats the model calls the crashes interrupted:
 *
 * 1. Starts the app's dev server in the background.
 * 2. Opens the app in a headed `agent-browser` session, starts a fresh chat
 *    session and sends a prompt that asks for a story written one paragraph
 *    per model call, running `ls -la .` after each paragraph.
 * 3. 10s after the response starts streaming, notes the steps (model calls)
 *    that finished with a tool result, presses the Crash button, which kills
 *    the dev server, and checks that the dev server died.
 * 4. Restarts the dev server, reloads the page, and checks that the chat
 *    picks the turn up again.
 * 5. Repeats steps 3 and 4 once more, 10s after the page picked the turn up.
 * 6. Waits until the turn finished in the UI, keeps the page open for
 *    another 5s, then checks that the turn also finished in the session's
 *    stream on the server, that the steps that finished before each crash
 *    kept their exact text, and that at most one step per crash was
 *    retracted.
 *
 * A model call that was repeated would produce different text, so unchanged
 * text of the finished steps shows that recovery did not repeat them.
 *
 * It closes the browser session and stops every dev server it started, also
 * when a check fails. It refuses to run while something else listens on the
 * app's port.
 *
 * Usage: `./tools/durable-harness-e2e/test-tool-calls.mts [--record [path]]`.
 * Must run outside of any sandbox, since it starts a server, a browser, and
 * Vercel Sandboxes. With `--record`, it records the browser session as a
 * video until it closes the browser, saved to `path` (resolved against the
 * current directory) or to `recording.mp4` in the current directory.
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
const browserSession = `durable-crash-recovery-tool-calls-${process.pid}`;
const prompt =
  'Write a story (about 800 words in total) about a lighthouse keeper who discovers a message in a bottle. Number every paragraph like [1], [2], ... Write only one paragraph per response: after each paragraph except the last, run `ls -la .` with the bash tool, and only once you have received its result, continue with the next paragraph. Do not use any other tools.';

const CRASH_AFTER_MS = 10_000;
const CRASH_COUNT = 2;
const KEEP_OPEN_AFTER_TURN_MS = 5_000;
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
  /**
   * The text of each step of the response, in order.
   */
  stepTexts: string[];
  /**
   * How many steps from the start of the response finished with the result
   * of their bash tool call.
   */
  finishedToolSteps: number;
  /**
   * The response's part types (with the state of tool parts), for messages.
   */
  partSummary: string[];
};

const logDir = mkdtempSync(join(tmpdir(), 'durable-crash-recovery-tool-calls-'));
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
  /*
   * A retracted step (\`reset-step\`) loses its parts but keeps its
   * \`step-start\`, so a step without parts is reused by the next one.
   */
  const steps = [];
  for (const part of last?.role === 'assistant' ? last.parts : []) {
    if (steps.length === 0 || (part.type === 'step-start' && !steps.at(-1).empty)) {
      steps.push({ text: '', toolResult: false, empty: true });
    }
    if (part.type === 'step-start') continue;
    const step = steps.at(-1);
    step.empty = false;
    if (part.type === 'text') step.text += part.text;
    if (part.type === 'tool-bash' && part.state === 'output-available') {
      step.toolResult = true;
    }
  }
  const finishedToolSteps = steps.findIndex(step => !step.toolResult);
  return JSON.stringify({
    chatId: session?.sessionId,
    runId: session?.runId,
    turnInProgress: chat?.turnInProgress ?? false,
    roles: messages.map(message => message.role),
    assistantTextLength: assistantText.length,
    assistantTextTail: assistantText.slice(-120),
    reconnecting: document.body.innerText.includes('Connection lost'),
    stepTexts: steps.map(step => step.text),
    finishedToolSteps: finishedToolSteps === -1 ? steps.length : finishedToolSteps,
    partSummary: (last?.role === 'assistant' ? last.parts : []).map(part =>
      part.state == null ? part.type : part.type + ':' + part.state,
    ),
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
 * Waits `CRASH_AFTER_MS`, presses Crash and checks that the dev server died,
 * then restarts it, reloads the page and waits until the page picked up the
 * turn again. Returns the restarted dev server and the text of the steps
 * that had finished with a tool result when Crash was pressed.
 */
async function crashAndRecover({
  server,
  crashNumber,
}: {
  server: DevServer;
  crashNumber: number;
}): Promise<{ server: DevServer; keptStepTexts: string[] }> {
  const label = `Crash ${crashNumber} of ${CRASH_COUNT}`;

  await sleep(CRASH_AFTER_MS);
  const beforeCrash = readChatState();
  if (beforeCrash?.turnInProgress !== true) {
    fail(`${label}: the turn finished before the crash. Use a longer prompt.`);
  }
  if (beforeCrash.finishedToolSteps === 0) {
    fail(
      `${label}: no step finished with a tool result before the crash, so the run cannot show that recovery keeps finished model calls. Response parts: ${beforeCrash.partSummary.join(', ')}`,
    );
  }
  const keptStepTexts = beforeCrash.stepTexts.slice(
    0,
    beforeCrash.finishedToolSteps,
  );
  log(
    `${label}: pressing Crash with ${beforeCrash.assistantTextLength} characters of the response shown, ${keptStepTexts.length} of ${beforeCrash.stepTexts.length} step(s) finished with a tool result.`,
  );
  browser(['find', 'role', 'button', 'click', '--name', 'Crash']);

  const crashed = await Promise.race([
    server.exited.then(() => true),
    sleep(SERVER_EXIT_TIMEOUT_MS).then(() => false),
  ]);
  if (!crashed) {
    fail(
      `${label}: the dev server did not crash within ${SERVER_EXIT_TIMEOUT_MS / 1000}s. See ${server.logPath}.`,
    );
  }
  await waitFor({
    description: `port ${port} to be released`,
    timeoutMs: SERVER_EXIT_TIMEOUT_MS,
    check: async () => ((await isPortInUse()) ? undefined : true),
  });
  log(`${label}: the dev server crashed.`);

  const afterCrash = readChatState();
  if (afterCrash == null || afterCrash.assistantTextLength === 0) {
    fail(`${label}: the page lost the partial response after the crash.`);
  }
  log(
    `${label}: the page keeps ${afterCrash.assistantTextLength} characters of the response${afterCrash.reconnecting ? ' and is reconnecting' : ''}.`,
  );

  const restartedServer = await startDevServer();

  log(`${label}: reloading the page.`);
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
    `${label}: the page picked up the turn (${pickedUp.assistantTextLength} characters, ${pickedUp.turnInProgress ? 'still streaming' : 'already finished'}).`,
  );

  return { server: restartedServer, keptStepTexts };
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

  let server = firstServer;
  const restartedServers: DevServer[] = [];
  const keptStepTextsPerCrash: string[][] = [];
  for (let crashNumber = 1; crashNumber <= CRASH_COUNT; crashNumber++) {
    const recovery = await crashAndRecover({ server, crashNumber });
    server = recovery.server;
    restartedServers.push(recovery.server);
    keptStepTextsPerCrash.push(recovery.keptStepTexts);
  }

  let lastLength = 0;
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

  log(
    `The turn finished. Keeping the page open for ${KEEP_OPEN_AFTER_TURN_MS / 1000}s.`,
  );
  await sleep(KEEP_OPEN_AFTER_TURN_MS);

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

  const lastKeptStepTexts = keptStepTextsPerCrash.at(-1) ?? [];
  if (finished.finishedToolSteps <= lastKeptStepTexts.length) {
    fail(
      `Expected more tool calls after the last crash, but the response has ${finished.finishedToolSteps} step(s) with a tool result.`,
    );
  }
  keptStepTextsPerCrash.forEach((keptStepTexts, crashIndex) => {
    keptStepTexts.forEach((text, index) => {
      if (finished.stepTexts[index] !== text) {
        fail(
          `Step ${index + 1} finished before crash ${crashIndex + 1} but its text changed, so its model call was repeated.\nBefore: ${JSON.stringify(text)}\nAfter: ${JSON.stringify(finished.stepTexts[index])}`,
        );
      }
    });
    log(
      `The ${keptStepTexts.length} step(s) that finished before crash ${crashIndex + 1} kept their text.`,
    );
  });
  log(`The response has ${finished.stepTexts.length} step(s).`);

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
  if (count('reset-step') > CRASH_COUNT) {
    fail(
      `The replay retracts ${count('reset-step')} steps, but only the ${CRASH_COUNT} step(s) the crashes interrupted should be retracted.`,
    );
  }
  log(
    `The server's replay of the turn finished (${count('text-start')} text parts, ${count('tool-input-available')} tool calls, ${count('reset-step')} reset-step).`,
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
  log(`PASSED: the turn survived ${CRASH_COUNT} crashes.`);
} catch (error) {
  console.error(
    `[verify] FAILED: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
} finally {
  await cleanUp();
  log(`Dev server logs: ${logDir}`);
}
