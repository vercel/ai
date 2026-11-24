#!/usr/bin/env node

/*
 * Exercises host tool approvals in the weather-tool-approval configuration of
 * `examples/durable-harness-e2e-next` through a headed agent-browser
 * session:
 *
 * 1. Starts the app's dev server in the background, on a local World in a
 *    fresh temporary directory, and starts a new weather-tool-approval session.
 * 2. Sends a prompt that asks for the weather in Paris and Tokyo with two
 *    parallel `weather` calls. Checks that the response ends with both calls
 *    waiting for approval, that the session's stream on the server shows
 *    both approval requests without any tool output, and that a reload
 *    keeps the requests.
 * 3. Approves Paris and checks that the turn does not continue while Tokyo
 *    still waits. Then denies Tokyo, which sends both responses, and waits
 *    until the turn finished. Paris must have its tool output and Tokyo
 *    must be denied, in the same assistant message, both in the UI and in
 *    the server's replay of the turn. A reload must keep the result.
 * 4. Sends a second prompt for Reykjavik, then kills the dev server with
 *    SIGKILL while its call waits for approval. Restarts with the same local
 *    World and checks that the server's replay and the reloaded page keep
 *    the same approval and tool call IDs without executing the tool. Approves
 *    the call and checks that the turn finishes normally.
 *
 * It closes the browser session and stops every dev server it started, also
 * when a check fails. It refuses to run while something else listens on the
 * app's port.
 *
 * Usage: `./tools/durable-harness-e2e/test-custom-tool-approval.mts [--harness
 * <id>] [--record [path]]`. Must run outside of any sandbox, since it starts
 * a server, a browser, and Vercel Sandboxes. With `--harness`, it starts the
 * session on the harness of `packages/harness-<id>-v2` (e.g. `pi` or `fx`),
 * and otherwise on the harness the new session dialog preselects. With
 * `--record`, it records the browser session as a video until it closes the
 * browser, saved to `path` (resolved against the current directory) or to
 * `recording.mp4` in the current directory. Build @ai-sdk/harness,
 * @ai-sdk/harness-pi-v2 and @ai-sdk/harness-fx-v2 before running.
 */

import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { closeSync, mkdtempSync, openSync } from 'node:fs';
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
const browserSession = `durable-tool-approval-${process.pid}`;
const logDir = mkdtempSync(join(tmpdir(), 'durable-tool-approval-'));
const configuration = 'weather-tool-approval';
const firstPrompt =
  'What is the weather in Paris and in Tokyo? Call the `weather` tool for both cities in parallel, in a single response, and do not call any other tool. Then summarize what you learned in one sentence and finish with APPROVAL_OK.';
const secondPrompt =
  'What is the weather in Reykjavik? Call the `weather` tool once and no other tool, then answer in one sentence and finish with SECOND_OK.';

const SERVER_READY_TIMEOUT_MS = 120_000;
const SERVER_EXIT_TIMEOUT_MS = 30_000;
const APPROVAL_REQUEST_TIMEOUT_MS = 120_000;
const TURN_END_TIMEOUT_MS = 180_000;
const NO_CONTINUATION_CHECK_MS = 3_000;
const POLL_INTERVAL_MS = 500;
const BROWSER_COMMAND_TIMEOUT_MS = 60_000;
const CHAT_INPUT = '[placeholder="Say something..."]';

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
 * A `weather` tool part of the chat's messages.
 */
type WeatherPart = {
  type: 'tool-weather';
  toolCallId: string;
  state: string;
  input?: { city?: string };
  output?: { city?: string; celsius?: number };
  approval?: { id: string; approved?: boolean; reason?: string };
};

/**
 * The chat as the page sees it, read from the session storage the chat
 * writes (`lib/stored-chat-state.ts`, `lib/stored-agent-session.ts`).
 */
type ChatState = {
  session?: {
    sessionId: string;
    runId: string;
    sandboxId: string;
    configuration: string;
  };
  heading: string;
  turnInProgress: boolean;
  roles: string[];
  /**
   * Text of the last assistant message.
   */
  assistantText: string;
  /**
   * `weather` tool parts of the last assistant message.
   */
  weatherParts: WeatherPart[];
  /**
   * Number of approve buttons on the page.
   */
  approveButtons: number;
};

/**
 * One chunk of a UI message stream response.
 */
type UIChunk = {
  type: string;
  approvalId?: string;
  toolCallId?: string;
  output?: unknown;
};

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
  check: () => T | undefined | Promise<T | undefined>;
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
    env: {
      ...process.env,
      HARNESS_WORLD: 'local',
      WORKFLOW_LOCAL_DATA_DIR: join(logDir, 'world'),
    },
  });
  closeSync(logFd);
  let exited = false;
  const server: DevServer = {
    child,
    logPath,
    exited: new Promise(resolve => {
      child.once('exit', () => {
        exited = true;
        resolve();
      });
    }),
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
        const response = await fetch(baseUrl, {
          signal: AbortSignal.timeout(2000),
        });
        await response.body?.cancel();
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
      sleep(5000).then(() => false),
    ]);
    if (stopped) return;
  }
}

/**
 * Abruptly kills only the dev server process group started by this script.
 * Approval waits have no running drive for the app's Crash button to kill,
 * so the test sends SIGKILL directly and keeps the local World's files.
 */
async function crashDevServer(server: DevServer): Promise<void> {
  const { pid } = server.child;
  if (pid == null || server.hasExited()) {
    fail('The dev server exited before the forced crash.');
  }
  process.kill(-pid, 'SIGKILL');
  await waitFor({
    description: 'the dev server to exit after SIGKILL',
    timeoutMs: SERVER_EXIT_TIMEOUT_MS,
    check: () => (server.hasExited() ? true : undefined),
  });
  if (server.child.signalCode !== 'SIGKILL') {
    fail(`Expected SIGKILL, got ${server.child.signalCode}.`);
  }
  await waitFor({
    description: `port ${port} to be released after the crash`,
    timeoutMs: SERVER_EXIT_TIMEOUT_MS,
    check: async () => ((await isPortInUse()) ? undefined : true),
  });
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
  const chatId = sessionStorage.getItem('durable-harness-basic-chat-id');
  const session = JSON.parse(sessionStorage.getItem('durable-harness-agent-session:' + chatId));
  const chat = JSON.parse(sessionStorage.getItem('durable-harness-chat-state:' + chatId));
  const messages = chat?.messages ?? [];
  const last = messages.at(-1);
  const parts = last?.role === 'assistant' ? last.parts : [];
  return JSON.stringify({
    session,
    heading: document.querySelector('h1')?.textContent ?? '',
    turnInProgress: chat?.turnInProgress ?? false,
    roles: messages.map(message => message.role),
    assistantText: parts.filter(part => part.type === 'text').map(part => part.text).join(''),
    weatherParts: parts.filter(part => part.type === 'tool-weather'),
    approveButtons: document.querySelectorAll('[data-approval-response="approve"]').length,
  });
})()`;

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

function readChatStateOrFail(): ChatState {
  return readChatState() ?? fail('Could not read the chat state.');
}

function sendPrompt(prompt: string): void {
  browser(['find', 'placeholder', 'Say something...', 'fill', prompt]);
  browser(['press', 'Enter']);
}

function reloadPage(): void {
  browser(['reload']);
  browser(['wait', CHAT_INPUT]);
}

function respondToApproval({
  part,
  response,
}: {
  part: WeatherPart;
  response: 'approve' | 'deny';
}): void {
  const approvalId =
    part.approval?.id ?? fail(`Tool call ${part.toolCallId} has no approval.`);
  browser([
    'click',
    `[data-approval-id="${approvalId}"][data-approval-response="${response}"]`,
  ]);
}

function findCityPart({
  state,
  city,
}: {
  state: ChatState;
  city: string;
}): WeatherPart {
  return (
    state.weatherParts.find(part => part.input?.city === city) ??
    fail(
      `Expected a weather call for ${city}, got calls for: ${state.weatherParts.map(part => part.input?.city).join(', ')}.`,
    )
  );
}

/**
 * Waits until the response ended with every `weather` call of the last
 * assistant message waiting for approval, and returns the chat state then.
 */
async function waitForApprovalRequests({
  count,
}: {
  count: number;
}): Promise<ChatState> {
  const state = await waitFor({
    description: `${count} weather call(s) to wait for approval`,
    timeoutMs: APPROVAL_REQUEST_TIMEOUT_MS,
    check: () => {
      const current = readChatState();
      return current != null &&
        !current.turnInProgress &&
        current.weatherParts.some(part => part.state === 'approval-requested')
        ? current
        : undefined;
    },
  });
  const states = state.weatherParts.map(part => part.state);
  if (
    states.length !== count ||
    states.some(partState => partState !== 'approval-requested')
  ) {
    fail(
      `Expected ${count} weather call(s) waiting for approval, got: ${states.join(', ')}.`,
    );
  }
  if (state.approveButtons !== count) {
    fail(`Expected ${count} approve button(s), got ${state.approveButtons}.`);
  }
  return state;
}

async function waitForFinishedTurn({
  marker,
}: {
  marker: string;
}): Promise<ChatState> {
  return waitFor({
    description: `the turn to finish with ${marker}`,
    timeoutMs: TURN_END_TIMEOUT_MS,
    check: () => {
      const state = readChatState();
      return state != null &&
        !state.turnInProgress &&
        state.assistantText.includes(marker)
        ? state
        : undefined;
    },
  });
}

/**
 * Reads the session's latest turn from the server, the way the chat
 * reconnects to it, and returns its UI message stream chunks.
 */
async function readServerReplay({
  harnessId,
  state,
}: {
  harnessId: string;
  state: ChatState;
}): Promise<UIChunk[]> {
  const session = state.session ?? fail('The page holds no agent session.');
  const params = new URLSearchParams({ runId: session.runId });
  const response = await fetch(
    `${baseUrl}/api/harness/${harnessId}/${configuration}/chat/${encodeURIComponent(session.sessionId)}/stream?${params}`,
    { signal: AbortSignal.timeout(30_000) },
  );
  if (!response.ok) fail(`The server replay failed: ${response.status}.`);
  return (await response.text())
    .split('\n')
    .filter(line => line.startsWith('data: {'))
    .map(line => JSON.parse(line.slice(6)) as UIChunk);
}

function countChunks({
  chunks,
  type,
  toolCallId,
}: {
  chunks: UIChunk[];
  type: string;
  toolCallId?: string;
}): number {
  return chunks.filter(
    chunk =>
      chunk.type === type &&
      (toolCallId == null || chunk.toolCallId === toolCallId),
  ).length;
}

async function verify(): Promise<void> {
  const harness = parseHarnessArg();
  if (await isPortInUse()) {
    fail(`Port ${port} is already in use. Stop the server listening there.`);
  }
  const server = await startDevServer();

  log(`Opening ${baseUrl} in the headed browser session ${browserSession}.`);
  browser([...browserLaunchArgs, 'open', baseUrl]);
  browserOpened = true;
  recording.start();
  browser(['wait', CHAT_INPUT]);
  const harnessId = await startNewSession({
    runBrowserCommand: browser,
    harness,
    configuration,
    log,
  });
  if (!readChatStateOrFail().heading.includes('Weather Tool Approval')) {
    fail('The page does not show the weather-tool-approval configuration.');
  }

  log('Sending the prompt for Paris and Tokyo.');
  sendPrompt(firstPrompt);
  const waiting = await waitForApprovalRequests({ count: 2 });
  const paris = findCityPart({ state: waiting, city: 'Paris' });
  const tokyo = findCityPart({ state: waiting, city: 'Tokyo' });
  log('The response ended with both weather calls waiting for approval.');

  const waitingReplay = await readServerReplay({ harnessId, state: waiting });
  if (
    countChunks({ chunks: waitingReplay, type: 'tool-approval-request' }) !==
      2 ||
    countChunks({ chunks: waitingReplay, type: 'finish' }) !== 1 ||
    countChunks({ chunks: waitingReplay, type: 'tool-output-available' }) !==
      0 ||
    countChunks({ chunks: waitingReplay, type: 'tool-output-denied' }) !== 0
  ) {
    fail(
      `The server replay of the waiting turn does not end at its two approval requests: ${waitingReplay.map(chunk => chunk.type).join(', ')}.`,
    );
  }
  log('The server replay shows both approval requests and no tool output.');

  reloadPage();
  const reloadedWaiting = readChatStateOrFail();
  if (
    JSON.stringify(reloadedWaiting.weatherParts) !==
      JSON.stringify(waiting.weatherParts) ||
    reloadedWaiting.approveButtons !== 2
  ) {
    fail('Reloading the page changed the pending approval requests.');
  }
  log('A reload keeps both pending approval requests.');

  log('Approving Paris.');
  respondToApproval({ part: paris, response: 'approve' });
  await sleep(NO_CONTINUATION_CHECK_MS);
  const partial = readChatStateOrFail();
  const partialStates = Object.fromEntries(
    partial.weatherParts.map(part => [part.input?.city, part.state]),
  );
  if (
    partial.turnInProgress ||
    partialStates.Paris !== 'approval-responded' ||
    partialStates.Tokyo !== 'approval-requested'
  ) {
    fail(
      `The turn must not continue while Tokyo waits for approval. Turn in progress: ${partial.turnInProgress}, states: ${JSON.stringify(partialStates)}.`,
    );
  }
  log('The turn waits while Tokyo still needs a response.');

  log('Denying Tokyo.');
  respondToApproval({ part: tokyo, response: 'deny' });
  const finished = await waitForFinishedTurn({ marker: 'APPROVAL_OK' });
  if (finished.roles.join(',') !== 'user,assistant') {
    fail(
      `Expected one user and one assistant message, got: ${finished.roles.join(', ')}.`,
    );
  }
  const finishedParis = findCityPart({ state: finished, city: 'Paris' });
  const finishedTokyo = findCityPart({ state: finished, city: 'Tokyo' });
  if (
    finished.weatherParts.length !== 2 ||
    finishedParis.toolCallId !== paris.toolCallId ||
    finishedParis.state !== 'output-available' ||
    finishedParis.output?.celsius !== 12 ||
    finishedTokyo.toolCallId !== tokyo.toolCallId ||
    finishedTokyo.state !== 'output-denied'
  ) {
    fail(
      `Expected Paris to have its output and Tokyo to be denied: ${JSON.stringify(finished.weatherParts)}.`,
    );
  }
  log('The turn finished with the Paris output and the Tokyo call denied.');

  const finishedReplay = await readServerReplay({ harnessId, state: finished });
  if (
    countChunks({ chunks: finishedReplay, type: 'finish' }) !== 1 ||
    countChunks({ chunks: finishedReplay, type: 'tool-approval-request' }) !==
      2 ||
    countChunks({
      chunks: finishedReplay,
      type: 'tool-output-available',
      toolCallId: paris.toolCallId,
    }) !== 1 ||
    countChunks({
      chunks: finishedReplay,
      type: 'tool-output-denied',
      toolCallId: tokyo.toolCallId,
    }) !== 1 ||
    countChunks({
      chunks: finishedReplay,
      type: 'tool-output-available',
      toolCallId: tokyo.toolCallId,
    }) !== 0
  ) {
    fail(
      `The server replay of the finished turn does not match the UI: ${finishedReplay.map(chunk => chunk.type).join(', ')}.`,
    );
  }
  log('The server replay of the finished turn matches the UI.');

  reloadPage();
  const reloadedFinished = readChatStateOrFail();
  if (
    JSON.stringify(reloadedFinished.weatherParts) !==
      JSON.stringify(finished.weatherParts) ||
    reloadedFinished.approveButtons !== 0
  ) {
    fail('Reloading the page changed the finished turn.');
  }
  log('A reload keeps the finished turn.');

  log('Sending the prompt for Reykjavik.');
  sendPrompt(secondPrompt);
  const secondWaiting = await waitForApprovalRequests({ count: 1 });
  const reykjavik = findCityPart({ state: secondWaiting, city: 'Reykjavik' });
  const secondWaitingReplay = await readServerReplay({
    harnessId,
    state: secondWaiting,
  });

  log('Forcing a SIGKILL crash while the Reykjavik call waits for approval.');
  await crashDevServer(server);
  await startDevServer();

  const recoveredReplay = await readServerReplay({
    harnessId,
    state: secondWaiting,
  });
  const approvalRequests = (chunks: UIChunk[]) =>
    chunks
      .filter(chunk => chunk.type === 'tool-approval-request')
      .map(({ approvalId, toolCallId }) => ({ approvalId, toolCallId }));
  if (
    approvalRequests(recoveredReplay).length !== 1 ||
    JSON.stringify(approvalRequests(recoveredReplay)) !==
      JSON.stringify(approvalRequests(secondWaitingReplay)) ||
    countChunks({ chunks: recoveredReplay, type: 'finish' }) !== 1 ||
    countChunks({ chunks: recoveredReplay, type: 'tool-output-available' }) !==
      0 ||
    countChunks({ chunks: recoveredReplay, type: 'tool-output-denied' }) !== 0
  ) {
    fail(
      `The server replay after the crash changed the pending approval or executed a tool: ${JSON.stringify(recoveredReplay)}.`,
    );
  }
  log('After restart, the server keeps the same approval and no tool output.');

  reloadPage();
  const recovered = await waitForApprovalRequests({ count: 1 });
  if (
    JSON.stringify(recovered.session) !==
      JSON.stringify(secondWaiting.session) ||
    recovered.roles.join(',') !== 'user,assistant,user,assistant' ||
    JSON.stringify(recovered.weatherParts) !==
      JSON.stringify(secondWaiting.weatherParts)
  ) {
    fail('Reloading after the crash changed the session or pending approval.');
  }
  log(
    'Reloading after the crash keeps the session and pending Reykjavik approval.',
  );

  log('Approving Reykjavik.');
  respondToApproval({ part: reykjavik, response: 'approve' });
  const secondFinished = await waitForFinishedTurn({ marker: 'SECOND_OK' });
  if (secondFinished.roles.join(',') !== 'user,assistant,user,assistant') {
    fail(
      `Expected two user and two assistant messages, got: ${secondFinished.roles.join(', ')}.`,
    );
  }
  const finishedReykjavik = findCityPart({
    state: secondFinished,
    city: 'Reykjavik',
  });
  if (
    secondFinished.weatherParts.length !== 1 ||
    finishedReykjavik.state !== 'output-available' ||
    finishedReykjavik.output?.celsius !== 3
  ) {
    fail(
      `Expected the approved Reykjavik call to have its output: ${JSON.stringify(secondFinished.weatherParts)}.`,
    );
  }
  log('The second turn finished with the approved Reykjavik output.');
}

async function cleanUp(): Promise<void> {
  if (browserOpened) {
    recording.stop();
    try {
      browser(['close']);
    } catch {}
    browserOpened = false;
  }
  for (const server of devServers) await stopDevServer(server);
}

process.once('SIGINT', () => {
  void cleanUp().finally(() => process.exit(130));
});

try {
  await verify();
  log(
    'PASSED: host tool approvals survive a forced crash and complete in the chat.',
  );
} catch (error) {
  console.error(
    `[verify] FAILED: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
} finally {
  await cleanUp();
  log(`Dev server logs and local World: ${logDir}`);
}
