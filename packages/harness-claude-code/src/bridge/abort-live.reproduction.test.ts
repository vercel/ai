import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { afterEach, expect, test, vi } from 'vitest';
import type * as ClaudeAgentSdk from '@anthropic-ai/claude-agent-sdk';

const state = vi.hoisted(() => ({
  host: new AbortController(),
  mode: 'reject' as 'reject' | 'timeout' | 'terminal',
  process: undefined as ChildProcess | undefined,
  abortedAt: 0,
  textAfterAbort: 0,
  interrupted: 0,
  terminalErrors: 0,
  exitedAt: 0,
  terminalAt: 0,
  completedAfterAbort: false,
  options: undefined as Record<string, unknown> | undefined,
}));

vi.mock('@anthropic-ai/claude-agent-sdk', async importOriginal => {
  const sdk = await importOriginal<typeof ClaudeAgentSdk>();
  return {
    ...sdk,
    query: (args: Parameters<typeof sdk.query>[0]) => {
      state.options = args.options as Record<string, unknown>;
      const q = sdk.query({
        ...args,
        options: {
          ...args.options,
          persistSession: false,
          spawnClaudeCodeProcess: options => {
            const child = spawn(options.command, options.args, {
              cwd: options.cwd,
              env: options.env,
              signal: options.signal,
              stdio: ['pipe', 'pipe', 'pipe'],
            });
            state.process = child;
            child.once('exit', () => {
              state.exitedAt = Date.now();
            });
            let buffer = '';
            child.stdout.on('data', chunk => {
              buffer += String(chunk);
              for (;;) {
                const end = buffer.indexOf('\n');
                if (end < 0) break;
                const line = buffer.slice(0, end);
                buffer = buffer.slice(end + 1);
                if (state.abortedAt && line.includes('"text_delta"')) {
                  state.textAfterAbort++;
                }
                if (
                  state.abortedAt &&
                  line.includes('"type":"result"') &&
                  line.includes('"subtype":"success"')
                ) {
                  state.completedAfterAbort = true;
                }
              }
            });
            return child;
          },
        },
      });
      // Fault injection is restricted to the graceful interrupt operation.
      // The bridge, SDK query/iterator, and CLI subprocess are real.
      if (state.mode !== 'terminal') {
        q.interrupt = async () => {
          state.interrupted++;
          if (state.mode === 'reject') throw new Error('interrupt unavailable');
          await new Promise<void>(() => {});
          throw new Error('unreachable');
        };
      }
      return q;
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
    await onStart(
      {
        prompt:
          'Write the numbers from 1 to 1000, one per line. Do not use tools.',
        thinking: { type: 'disabled' },
        nativeTools: [],
        ...(state.mode === 'terminal' ? { maxBudgetUsd: 0.000001 } : {}),
      },
      {
        abortSignal: state.host.signal,
        firstTurn: true,
        experimental_userMessages: {
          pendingCount: 0,
          close: () => {},
          [Symbol.asyncIterator]: async function* () {},
        },
        emit: (event: { type: string }) => {
          if (
            event.type === 'text-delta' &&
            !state.host.signal.aborted &&
            state.mode !== 'terminal'
          ) {
            state.abortedAt = Date.now();
            state.host.abort();
          }
          if (event.type === 'error') {
            state.terminalErrors++;
            state.terminalAt = Date.now();
          }
        },
        emitWarning: () => {},
        emitError: () => {},
        requestToolResult: async () => ({ output: {} }),
        requestToolApproval: async () => ({ approved: true }),
      },
    );
  },
}));

const originalArgv = [...process.argv];

function resetState(mode: typeof state.mode) {
  state.mode = mode;
  state.host = new AbortController();
  state.process = undefined;
  state.options = undefined;
  state.abortedAt = 0;
  state.textAfterAbort = 0;
  state.interrupted = 0;
  state.terminalErrors = 0;
  state.exitedAt = 0;
  state.terminalAt = 0;
  state.completedAfterAbort = false;
}

afterEach(async () => {
  state.process?.kill('SIGKILL');
  process.argv.splice(0, process.argv.length, ...originalArgv);
  vi.resetModules();
});

test
  .skipIf(process.env.AI_SDK_REPRODUCE_24826 !== '1')
  .each(['reject', 'timeout', 'terminal'] as const)(
  'real Claude CLI stops after %s teardown',
  async mode => {
    resetState(mode);
    process.argv.splice(
      0,
      process.argv.length,
      'node',
      'bridge.mjs',
      '--workdir',
      process.cwd(),
      '--bridge-state-dir',
      process.cwd(),
    );
    let timedOut = false;
    const watchdog = setTimeout(() => {
      timedOut = true;
      state.process?.kill('SIGKILL');
    }, 25000);
    try {
      await import('./index');
      await delay(2500);
      const child = state.process;
      expect(child, 'real SDK must spawn a CLI subprocess').toBeDefined();
      if (mode !== 'terminal') {
        expect(
          state.abortedAt,
          'must abort during real text generation',
        ).toBeGreaterThan(0);
        expect(state.interrupted).toBe(1);
      } else {
        expect(
          state.terminalErrors,
          'must observe a real terminal error',
        ).toBeGreaterThan(0);
      }
      console.log(
        JSON.stringify({
          mode,
          hasAbortController: !!state.options?.abortController,
          textAfterHostAbort: state.textAfterAbort,
          exitCode: child?.exitCode,
          signalCode: child?.signalCode,
          completedAfterAbort: state.completedAfterAbort,
          teardownMs:
            state.exitedAt -
            (mode === 'terminal' ? state.terminalAt : state.abortedAt),
        }),
      );
      expect(
        child?.exitCode !== null || child?.signalCode !== null,
        'PRIMARY BUG: Claude CLI survives bridge hard-abort teardown',
      ).toBe(true);
      expect(timedOut, 'watchdog must not cause the CLI exit').toBe(false);
      const deadline =
        (mode === 'terminal' ? state.terminalAt : state.abortedAt) +
        (mode === 'timeout' ? 5000 : 0) +
        3500;
      expect(
        state.exitedAt,
        'PRIMARY BUG: Claude CLI survives bridge hard-abort deadline',
      ).toBeLessThanOrEqual(deadline);
      expect(
        state.completedAfterAbort,
        'PRIMARY BUG: Claude CLI runs to successful completion after hard abort',
      ).toBe(false);
    } finally {
      clearTimeout(watchdog);
    }
  },
  35000,
);
