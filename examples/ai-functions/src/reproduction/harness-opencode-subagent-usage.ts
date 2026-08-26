import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

type BridgeEvent = Record<string, unknown>;

type ReproductionState = {
  readonly start: Record<string, unknown>;
  readonly turn: Record<string, unknown>;
  readonly client: Record<string, unknown>;
};

declare global {
  // Shared with the virtual modules bundled around the actual OpenCode bridge.
  var __issue19668State: ReproductionState | undefined;
}

async function main() {
  const emitted: BridgeEvent[] = [];
  const userMessages = createUserMessages();
  const childTokens = {
    input: 3,
    output: 5,
    reasoning: 1,
    cache: { read: 10, write: 2 },
  };

  globalThis.__issue19668State = {
    start: {
      type: 'start',
      operation: 'prompt',
      prompt: 'Delegate this task.',
    },
    turn: {
      emit: (event: BridgeEvent) => emitted.push(event),
      requestToolResult: async () => ({ output: null }),
      requestToolApproval: async () => true,
      experimental_userMessages: userMessages,
      abortSignal: new AbortController().signal,
      firstTurn: true,
      bridgeLog: () => {},
      emitWarning: () => {},
      emitError: () => {},
    },
    client: {
      mcp: { status: async () => ({ data: {} }) },
      session: {
        create: async () => ({ data: { id: 'parent-session' } }),
        get: async () => ({ data: {} }),
        messages: async () => ({ data: [] }),
        promptAsync: async () => ({ data: {} }),
      },
      event: {
        subscribe: async () => ({
          stream: createOpenCodeEventStream({ childTokens }),
        }),
      },
      v2: {
        session: {
          context: async () => ({ data: [] }),
        },
      },
    },
  };

  const workspaceRoot = fileURLToPath(new URL('../../../../', import.meta.url));
  const buildDir = await mkdtemp(
    path.join(workspaceRoot, '.issue-19668-build-'),
  );

  try {
    await executeActualBridge({ buildDir });

    const rootStep = emitted.find(event => event.type === 'finish-step');
    assert.deepEqual(rootStep, {
      type: 'finish-step',
      finishReason: { unified: 'stop', raw: 'stop' },
      usage: {
        inputTokens: {
          total: 1,
          noCache: 1,
          cacheRead: 0,
          cacheWrite: 0,
        },
        outputTokens: { total: 1, text: 1, reasoning: 0 },
      },
      harnessMetadata: { opencode: { cost: 0 } },
    });

    const finish = emitted.at(-1);
    assert.deepEqual(finish, {
      type: 'finish',
      finishReason: { unified: 'stop', raw: 'stop' },
      totalUsage: rootStep.usage,
    });

    const subagentUsageEvents = emitted.filter(
      event =>
        event.type === 'raw' &&
        (event.rawValue as { type?: unknown } | undefined)?.type ===
          'opencode.subagent-usage',
    );

    if (subagentUsageEvents.length === 0) {
      console.error(
        'ISSUE_19668_REPRODUCED: completed child model step produced no opencode.subagent-usage raw record',
      );
      process.exitCode = 1;
      return;
    }

    assert.deepEqual(subagentUsageEvents, [
      {
        type: 'raw',
        rawValue: {
          type: 'opencode.subagent-usage',
          version: 1,
          sessionId: 'child-session',
          stepId: 'child-message',
          modelId: 'openai/gpt-5.6-sol',
          usage: {
            inputTokens: {
              total: childTokens.input,
              noCache: 0,
              cacheRead: childTokens.cache.read,
              cacheWrite: childTokens.cache.write,
            },
            outputTokens: {
              total: childTokens.output + childTokens.reasoning,
              text: childTokens.output,
              reasoning: childTokens.reasoning,
            },
          },
          cost: 0.0042,
        },
      },
    ]);

    const rawValue = subagentUsageEvents[0].rawValue as Record<string, unknown>;
    for (const privateField of [
      'prompt',
      'output',
      'reasoning',
      'tool',
      'toolPayload',
    ]) {
      assert.equal(privateField in rawValue, false);
    }

    console.log(
      'Issue #19668 is fixed: the completed child step emitted one bounded usage record.',
    );
  } finally {
    delete globalThis.__issue19668State;
    await rm(buildDir, { recursive: true, force: true });
  }
}

function createOpenCodeEventStream({
  childTokens,
}: {
  childTokens: {
    input: number;
    output: number;
    reasoning: number;
    cache: { read: number; write: number };
  };
}): AsyncIterable<unknown> {
  return {
    async *[Symbol.asyncIterator]() {
      yield {
        type: 'message.part.updated',
        properties: {
          part: {
            type: 'tool',
            sessionID: 'parent-session',
            callID: 'task-call',
            tool: 'task',
            state: {
              status: 'running',
              input: { prompt: 'Research this.' },
              metadata: {
                parentSessionId: 'parent-session',
                sessionId: 'child-session',
              },
            },
          },
        },
      };
      yield {
        type: 'message.updated',
        properties: {
          info: {
            id: 'child-message',
            sessionID: 'child-session',
            role: 'assistant',
            providerID: 'openai',
            modelID: 'gpt-5.6-sol',
          },
        },
      };
      yield {
        type: 'message.part.updated',
        properties: {
          part: {
            id: 'child-step-finish',
            messageID: 'child-message',
            sessionID: 'child-session',
            type: 'step-finish',
            reason: 'stop',
            cost: 0.0042,
            tokens: childTokens,
          },
        },
      };
      yield {
        type: 'session.next.step.ended',
        properties: {
          sessionID: 'parent-session',
          finish: 'stop',
          tokens: {
            input: 1,
            output: 1,
            reasoning: 0,
            cache: { read: 0, write: 0 },
          },
          cost: 0,
        },
      };
      yield {
        type: 'session.status',
        properties: {
          sessionID: 'parent-session',
          status: { type: 'busy' },
        },
      };
      yield {
        type: 'session.status',
        properties: {
          sessionID: 'parent-session',
          status: { type: 'idle' },
        },
      };
    },
  };
}

async function executeActualBridge({ buildDir }: { buildDir: string }) {
  const harnessPackageRequire = createRequire(
    new URL(
      '../../../../packages/harness-opencode/package.json',
      import.meta.url,
    ),
  );
  const tsupPackagePath = harnessPackageRequire.resolve('tsup/package.json');
  const esbuild = createRequire(tsupPackagePath)('esbuild') as {
    build(options: Record<string, unknown>): Promise<void>;
  };
  const outputPath = path.join(buildDir, 'bridge.mjs');
  const bridgePath = new URL(
    '../../../../packages/harness-opencode/src/bridge/index.ts',
    import.meta.url,
  );

  await esbuild.build({
    entryPoints: [bridgePath.pathname],
    outfile: outputPath,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    plugins: [
      {
        name: 'issue-19668-module-mocks',
        setup(build: {
          onResolve(
            options: { filter: RegExp },
            callback: (args: { path: string }) => unknown,
          ): void;
          onLoad(
            options: { filter: RegExp; namespace: string },
            callback: (args: { path: string }) => unknown,
          ): void;
        }) {
          build.onResolve(
            {
              filter: /^(@ai-sdk\/harness\/bridge|@opencode-ai\/sdk\/v2)$/,
            },
            args => ({
              path: args.path,
              namespace: 'issue-19668-mock',
            }),
          );
          build.onLoad(
            { filter: /.*/, namespace: 'issue-19668-mock' },
            args => ({
              loader: 'js',
              contents:
                args.path === '@ai-sdk/harness/bridge'
                  ? `
                    export async function runBridge(options) {
                      const state = globalThis.__issue19668State;
                      if (!state) throw new Error('Missing reproduction state');
                      await options.onStart(state.start, state.turn);
                      return { close() {} };
                    }
                  `
                  : `
                    export async function createOpencodeServer() {
                      return {
                        url: 'http://127.0.0.1:4096',
                        close() {},
                      };
                    }
                    export function createOpencodeClient() {
                      const state = globalThis.__issue19668State;
                      if (!state) throw new Error('Missing reproduction state');
                      return state.client;
                    }
                  `,
            }),
          );
        },
      },
    ],
  });

  const originalArgv = [...process.argv];
  process.argv.length = 0;
  process.argv.push(
    process.execPath,
    'opencode-bridge',
    '--workdir',
    '/tmp/opencode-bridge-issue-19668',
    '--bridge-state-dir',
    '/tmp/opencode-bridge-issue-19668-state',
    '--bootstrap-dir',
    '/tmp/opencode-bridge-issue-19668-bootstrap',
  );
  try {
    await import(`${pathToFileURL(outputPath).href}?run=${Date.now()}`);
  } finally {
    process.argv.length = 0;
    process.argv.push(...originalArgv);
  }
}

function createUserMessages() {
  let closed = false;
  const waiters: Array<(result: IteratorResult<never>) => void> = [];

  return {
    pendingCount: 0,
    close() {
      closed = true;
      for (const resolve of waiters.splice(0)) {
        resolve({ done: true, value: undefined });
      }
    },
    [Symbol.asyncIterator]() {
      return {
        next: () =>
          closed
            ? Promise.resolve({ done: true as const, value: undefined })
            : new Promise<IteratorResult<never>>(resolve => {
                waiters.push(resolve);
              }),
      };
    },
  };
}

main().catch(error => {
  console.error('ISSUE_19668_HARNESS_ERROR', error);
  process.exitCode = 2;
});
