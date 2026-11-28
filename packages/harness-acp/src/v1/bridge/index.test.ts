import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type * as childProcess from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACP_BRIDGE_CONFIGURATION_ENV } from './acp-v1-bridge-environment';

const state = vi.hoisted(() => ({
  emitted: [] as Record<string, unknown>[],
  start: {} as Record<string, unknown>,
  turnError: undefined as unknown,
  spawned: [] as Array<{ kill(): boolean }>,
}));

vi.mock('node:child_process', async importOriginal => {
  const original = await importOriginal<typeof childProcess>();
  return {
    ...original,
    spawn: (...args: Parameters<typeof original.spawn>) => {
      const child = original.spawn(...args);
      state.spawned.push(child);
      return child;
    },
  };
});

vi.mock('@ai-sdk/harness/bridge', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  runBridge: async ({
    onStart,
  }: {
    onStart: (start: unknown, turn: unknown) => Promise<void>;
  }) => {
    try {
      await onStart(state.start, {
        abortSignal: new AbortController().signal,
        firstTurn: true,
        emit: (event: Record<string, unknown>) => state.emitted.push(event),
        emitWarning: () => {},
        emitError: () => {},
        bridgeLog: () => {},
        requestToolResult: async () => ({ output: {} }),
        requestToolApproval: async () => ({ approved: true }),
      });
    } catch (error) {
      state.turnError = error;
    }
  },
}));

const fakeAgent = fileURLToPath(
  new URL('./__fixtures__/fake-cursor-subagent-agent.mjs', import.meta.url),
);

let directory: string;
let originalArgv: string[];

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'harness-acp-bridge-'));
  state.emitted = [];
  state.turnError = undefined;
  state.spawned = [];
  state.start = {
    type: 'start',
    prompt: [
      {
        type: 'text',
        text: 'Find the port in a background sub-agent, then report it.',
      },
    ],
    tools: [],
    permissionMode: 'allow-all',
  };
  originalArgv = [...process.argv];
  process.argv.splice(
    0,
    process.argv.length,
    'node',
    'bridge.mjs',
    '--workdir',
    directory,
    '--bridge-state-dir',
    directory,
    '--bridge-type',
    'cursor',
  );
  vi.stubEnv('AI_SDK_ACP_CLIENT_APP_NAME', 'ai-sdk-harness-cursor');
  vi.stubEnv('AI_SDK_ACP_CLIENT_APP_VERSION', '0.0.0-test');
  vi.stubEnv(
    ACP_BRIDGE_CONFIGURATION_ENV,
    JSON.stringify({
      agent: {
        command: process.execPath,
        args: [fakeAgent, path.join(directory, 'agent.log')],
      },
      // What @ai-sdk/harness-cursor configures, and hashes into its agent
      // identity.
      clientCapabilities: { _meta: { parameterizedModelPicker: true } },
    }),
  );
});

afterEach(async () => {
  for (const child of state.spawned) child.kill();
  process.argv.splice(0, process.argv.length, ...originalArgv);
  vi.unstubAllEnvs();
  vi.resetModules();
  await rm(directory, { recursive: true, force: true });
});

async function agentLog(): Promise<Record<string, unknown>[]> {
  const text = await readFile(path.join(directory, 'agent.log'), 'utf8');
  return text
    .trim()
    .split('\n')
    .map(line => JSON.parse(line));
}

test('holds the prompt for a Cursor background sub-agent and answers cursor/task', async () => {
  await import('./index');

  expect(state.turnError).toBeUndefined();
  expect(
    state.emitted
      .filter(event => event.type === 'text-delta')
      .map(event => event.delta),
  ).toEqual(['Started a background sub-agent.', 'BG_DONE']);
  expect(
    (await agentLog()).find(entry => entry.event === 'cursor/task answered'),
  ).toEqual({ event: 'cursor/task answered', answer: { result: {} } });
  expect(state.emitted.at(-1)).toMatchObject({ type: 'finish' });
});
