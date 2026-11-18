#!/usr/bin/env node

/*
 * Exercises the mcp-context7 configuration in the durable harness example
 * through a headed agent-browser session. It verifies a successful Context7
 * lookup and documentation query, then crashes the server during a second
 * documentation query and reconnects the same session after restarting it.
 * Completed tool results must survive unchanged, and the interrupted call
 * must appear exactly once as an error rather than being retried.
 *
 * Usage: `./tools/durable-harness-e2e/test-mcp-context7.mts --harness pi`
 * (or `fx`), optionally with `--record [path]`. Without --harness, uses the
 * dialog's preselected harness. Run outside a sandbox, with agent-browser
 * installed and the example app's Vercel Sandbox and AI Gateway credentials
 * configured. Build @ai-sdk/harness, @ai-sdk/harness-pi-v2 and
 * @ai-sdk/harness-fx-v2 before running. Calls the real Context7 HTTP server.
 *
 * Refuses to use an occupied port, keeps its local World in a fresh temporary
 * directory, and closes its browser and all servers it starts on exit.
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
const port = 3000;
const baseUrl = `http://localhost:${port}`;
const browserSession = `durable-mcp-context7-${process.pid}`;
const logDir = mkdtempSync(join(tmpdir(), 'durable-mcp-context7-'));
const configuration = 'mcp-context7';
const normalPrompt =
  'Use only Context7 MCP tools. First resolve the React library ID. After receiving its result, query the React docs for useEffect cleanup. Summarize in two sentences and finish with MCP_OK.';
const crashPrompt =
  'Use fresh Context7 MCP calls: first resolve the Next.js library ID, then after receiving its result query its docs for App Router caching. If a tool is interrupted, do not retry it or call another tool; report that it was interrupted and finish with MCP_RECOVERED.';
const SERVER_TIMEOUT_MS = 120_000;
const TURN_TIMEOUT_MS = 180_000;

type DevServer = {
  child: ChildProcess;
  logPath: string;
  exited: Promise<void>;
  hasExited: () => boolean;
};

type ToolPart = {
  type: string;
  toolName?: string;
  toolCallId: string;
  state: string;
  output?: unknown;
  errorText?: string;
};

type ChatState = {
  session?: {
    sessionId: string;
    runId: string;
    sandboxId: string;
    configuration: string;
  };
  harness: string | null;
  heading: string;
  turnInProgress: boolean;
  roles: string[];
  assistantText: string;
  tools: ToolPart[];
};

const devServers: DevServer[] = [];
let browserOpened = false;
const recording = createBrowserRecording({
  runBrowserCommand: browser,
  log,
});

function log(message: string): void {
  console.log(`[verify] ${message}`);
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
      throw new Error(`Timed out waiting for ${description}.`);
    }
    await sleep(500);
  }
}

async function startDevServer(): Promise<DevServer> {
  const logPath = join(logDir, `dev-server-${devServers.length + 1}.log`);
  const logFd = openSync(logPath, 'a');
  const child = spawn(
    'pnpm',
    ['--filter', '@example/durable-harness-e2e-next', 'dev'],
    {
      cwd: repoRoot,
      detached: true,
      stdio: ['ignore', logFd, logFd],
      env: {
        ...process.env,
        HARNESS_WORLD: 'local',
        WORKFLOW_LOCAL_DATA_DIR: join(logDir, 'world'),
      },
    },
  );
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
  log(`Started dev server ${child.pid}, logging to ${logPath}.`);
  await waitFor({
    description: 'the dev server to serve the app',
    timeoutMs: SERVER_TIMEOUT_MS,
    check: async () => {
      if (server.hasExited()) {
        throw new Error(`Dev server exited while starting. See ${logPath}.`);
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
    if (
      await Promise.race([
        server.exited.then(() => true),
        sleep(5000).then(() => false),
      ])
    ) {
      return;
    }
  }
}

function browser(args: string[]): string {
  return execFileSync('agent-browser', ['--session', browserSession, ...args], {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 60_000,
  }).trim();
}

function evaluate<T>(script: string): T {
  const output = execFileSync(
    'agent-browser',
    ['--session', browserSession, 'eval', '--stdin'],
    {
      input: script,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 60_000,
    },
  );
  let value: unknown = JSON.parse(output);
  if (typeof value === 'string') value = JSON.parse(value);
  return value as T;
}

const readChatStateScript = `(() => {
  const chatId = sessionStorage.getItem('durable-harness-basic-chat-id');
  const session = JSON.parse(sessionStorage.getItem('durable-harness-agent-session:' + chatId));
  const chat = JSON.parse(sessionStorage.getItem('durable-harness-chat-state:' + chatId));
  const messages = chat?.messages ?? [];
  const last = messages.at(-1);
  const parts = last?.role === 'assistant' ? last.parts : [];
  return {
    session,
    harness: sessionStorage.getItem('durable-harness-chat-harness:' + chatId),
    heading: document.querySelector('h1')?.textContent ?? '',
    turnInProgress: chat?.turnInProgress ?? false,
    roles: messages.map(message => message.role),
    assistantText: parts.filter(part => part.type === 'text').map(part => part.text).join(''),
    tools: parts.filter(part => part.type === 'dynamic-tool' || part.type.startsWith('tool-')),
  };
})()`;

function readChatState(): ChatState {
  return evaluate<ChatState>(readChatStateScript);
}

function sendPrompt(prompt: string): void {
  browser(['find', 'placeholder', 'Say something...', 'fill', prompt]);
  browser(['press', 'Enter']);
}

async function waitForFinishedTurn(marker: string): Promise<ChatState> {
  return waitFor({
    description: `the turn to finish with ${marker}`,
    timeoutMs: TURN_TIMEOUT_MS,
    check: () => {
      const state = readChatState();
      return !state.turnInProgress && state.assistantText.includes(marker)
        ? state
        : undefined;
    },
  });
}

function verifyConfiguration({
  state,
  harnessId,
}: {
  state: ChatState;
  harnessId: string;
}): void {
  if (
    state.harness !== harnessId ||
    state.session?.configuration !== configuration ||
    !state.heading.includes('MCP (context7)')
  ) {
    throw new Error(
      'The page did not retain the selected harness/configuration.',
    );
  }
  if (state.tools.some(part => part.type !== 'dynamic-tool')) {
    throw new Error(
      'MCP tools must render as dynamic tools without static duplicates.',
    );
  }
}

async function verify(): Promise<void> {
  const harness = parseHarnessArg();
  if (await isPortInUse()) {
    throw new Error(`Port ${port} is in use. Stop that server before running.`);
  }
  const server = await startDevServer();
  browser([...browserLaunchArgs, 'open', baseUrl]);
  browserOpened = true;
  recording.start();
  browser(['wait', '[placeholder="Say something..."]']);
  const harnessId = await startNewSession({
    runBrowserCommand: browser,
    harness,
    configuration,
    log,
  });
  const session = readChatState().session;
  if (session == null) throw new Error('The new session was not stored.');

  log('Running a normal Context7 lookup and documentation query.');
  sendPrompt(normalPrompt);
  const normal = await waitForFinishedTurn('MCP_OK');
  verifyConfiguration({ state: normal, harnessId });
  if (
    normal.tools.length !== 2 ||
    !normal.tools.some(part =>
      /resolve[-_]library[-_]id/.test(part.toolName ?? ''),
    ) ||
    !normal.tools.some(part => /query[-_]docs/.test(part.toolName ?? '')) ||
    normal.tools.some(
      part => part.state !== 'output-available' || part.output == null,
    )
  ) {
    throw new Error('Expected two successful Context7 MCP tool calls.');
  }
  log('Both Context7 calls completed and rendered as dynamic tools.');
  browser(['reload']);
  browser(['wait', '[placeholder="Say something..."]']);
  const reloaded = readChatState();
  verifyConfiguration({ state: reloaded, harnessId });
  if (JSON.stringify(reloaded.tools) !== JSON.stringify(normal.tools)) {
    throw new Error('Reload changed the completed tool results.');
  }

  const warmup = await fetch(
    `${baseUrl}/api/harness/${harnessId}/${configuration}/crash`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    },
  );
  if (warmup.status !== 400)
    throw new Error('Could not warm up the crash route.');
  sendPrompt(crashPrompt);

  /*
   * Observe inside the page so a short remote call cannot finish between
   * separate CLI polls. Allow time for the execution-start commit after the
   * model exposes its input, then return the snapshot before clicking Crash.
   * Recovery must report a non-retryable interruption below; that proves
   * execution actually began rather than merely interrupting model input.
   */
  const beforeCrash = evaluate<ChatState>(`new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      clearInterval(timer);
      reject(new Error('Context7 query did not start within 45 seconds.'));
    }, 45000);
    const timer = setInterval(() => {
      const state = ${readChatStateScript};
      const pending = state.tools.find(part =>
        /query[-_]docs/.test(part.toolName ?? '') && part.state === 'input-available');
      if (!pending) return;
      clearInterval(timer);
      setTimeout(() => {
        clearTimeout(timeout);
        const snapshot = ${readChatStateScript};
        if (!snapshot.tools.some(part =>
          part.toolCallId === pending.toolCallId && part.state === 'input-available')) {
          reject(new Error('Context7 query finished before it could be crashed.'));
          return;
        }
        resolve(snapshot);
        setTimeout(() => Array.from(document.querySelectorAll('button'))
          .find(button => button.textContent.trim() === 'Crash').click(), 0);
      }, 150);
    }, 20);
  })`);
  const interrupted = beforeCrash.tools.find(
    part => part.state === 'input-available',
  );
  const completed = beforeCrash.tools.filter(
    part => part.state === 'output-available',
  );
  if (interrupted == null || completed.length !== 1) {
    throw new Error(
      'Expected one completed lookup and one in-flight docs call.',
    );
  }
  log(`Crashing during ${interrupted.toolName} (${interrupted.toolCallId}).`);
  await waitFor({
    description: `the server to crash (see ${server.logPath})`,
    timeoutMs: 30_000,
    check: () => (server.hasExited() ? true : undefined),
  });
  await waitFor({
    description: 'the crashed server to release its port',
    timeoutMs: 30_000,
    check: async () => ((await isPortInUse()) ? undefined : true),
  });

  await startDevServer();
  browser(['reload']);
  browser(['wait', '[placeholder="Say something..."]']);
  const recovered = await waitForFinishedTurn('MCP_RECOVERED');
  verifyConfiguration({ state: recovered, harnessId });
  if (JSON.stringify(recovered.session) !== JSON.stringify(session)) {
    throw new Error('Recovery did not retain the same agent session.');
  }
  if (recovered.roles.join(',') !== 'user,assistant,user,assistant') {
    throw new Error('Recovery duplicated or lost a chat message.');
  }
  for (const part of completed) {
    const kept = recovered.tools.find(
      tool => tool.toolCallId === part.toolCallId,
    );
    if (JSON.stringify(kept) !== JSON.stringify(part)) {
      throw new Error('Recovery changed the completed lookup result.');
    }
  }
  const calls = recovered.tools.filter(
    part => part.toolCallId === interrupted.toolCallId,
  );
  if (
    recovered.tools.length !== 2 ||
    calls.length !== 1 ||
    calls[0].state !== 'output-error' ||
    !calls[0].errorText?.includes('interrupted')
  ) {
    throw new Error(
      'The interrupted MCP call was retried, duplicated or lost.',
    );
  }

  const params = new URLSearchParams({ runId: session.runId });
  const response = await fetch(
    `${baseUrl}/api/harness/${harnessId}/${configuration}/chat/${session.sessionId}/stream?${params}`,
    { signal: AbortSignal.timeout(30_000) },
  );
  if (!response.ok) throw new Error(`Replay failed: ${response.status}.`);
  const chunks = (await response.text())
    .split('\n')
    .filter(line => line.startsWith('data: {'))
    .map(line => JSON.parse(line.slice(6)));
  if (
    chunks.filter(chunk => chunk.type === 'finish').length !== 1 ||
    chunks.filter(
      chunk =>
        chunk.type === 'tool-input-available' &&
        chunk.toolCallId === interrupted.toolCallId,
    ).length !== 1 ||
    !chunks.some(
      chunk =>
        chunk.type === 'tool-output-error' &&
        chunk.toolCallId === interrupted.toolCallId &&
        chunk.errorText.includes('interrupted'),
    )
  ) {
    throw new Error(
      'The durable server replay does not match the recovered UI.',
    );
  }
  log(
    'The same session recovered, kept the lookup, and did not retry the interrupted MCP call.',
  );
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
    'PASSED: Context7 MCP tools survive a server crash without unsafe replay.',
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
