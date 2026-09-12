import type {
  HarnessV1,
  HarnessV1ContinueTurnState,
  HarnessV1NetworkSandboxSession,
  HarnessV1PromptTurnOptions,
  HarnessV1SandboxProvider,
  HarnessV1Session,
  HarnessV1StreamPart,
} from '@ai-sdk/harness';
import { HarnessAgent, type HarnessAgentSession } from '@ai-sdk/harness/agent';
import { jsonSchema, Output } from 'ai';
import { describe, expect, test, vi } from 'vitest';
import { createHarnessWorkflowState } from './harness-workflow-state';
import {
  type HarnessWorkflowAgent,
  type HarnessWorkflowChunk,
  type HarnessWorkflowStreamResult,
} from './run-harness-agent';
import { runHarnessAgentStep } from './run-harness-agent-step';

type ScoreOutput = { score: number };

function zeroUsage() {
  return {
    inputTokens: {
      total: 1,
      noCache: 1,
      cacheRead: undefined,
      cacheWrite: undefined,
    },
    outputTokens: {
      total: 1,
      text: 1,
      reasoning: undefined,
    },
  };
}

function outputEvents(text: string): HarnessV1StreamPart[] {
  return [
    { type: 'stream-start', modelId: 'mock-model' },
    { type: 'text-start', id: 'text-1' },
    { type: 'text-delta', id: 'text-1', delta: text },
    { type: 'text-end', id: 'text-1' },
    {
      type: 'finish-step',
      finishReason: { unified: 'stop', raw: 'stop' },
      usage: zeroUsage(),
    },
    {
      type: 'finish',
      finishReason: { unified: 'stop', raw: 'stop' },
      totalUsage: zeroUsage(),
    },
  ];
}

function createOutputHarness(text: string): HarnessV1 {
  let session: HarnessV1Session;

  session = {
    sessionId: 'session-1',
    isResume: false,
    async doPromptTurn(options: HarnessV1PromptTurnOptions) {
      queueMicrotask(() => {
        for (const event of outputEvents(text)) {
          options.emit(event);
        }
      });
      return {
        submitToolResult: async () => {},
        done: Promise.resolve(),
      };
    },
    async doContinueTurn() {
      return {
        submitToolResult: async () => {},
        done: Promise.resolve(),
      };
    },
    async doCompact() {},
    async doDetach() {
      return {
        type: 'resume-session',
        harnessId: 'mock-output',
        specificationVersion: 'harness-v1',
        data: {},
      };
    },
    async doStop() {
      return {
        type: 'resume-session',
        harnessId: 'mock-output',
        specificationVersion: 'harness-v1',
        data: {},
      };
    },
    async doDestroy() {},
    async doSuspendTurn() {
      return {
        type: 'continue-turn',
        harnessId: 'mock-output',
        specificationVersion: 'harness-v1',
        data: {},
      };
    },
  };

  return {
    specificationVersion: 'harness-v1',
    harnessId: 'mock-output',
    builtinTools: {},
    async doStart() {
      return session;
    },
  };
}

function createSandboxProvider(): HarnessV1SandboxProvider {
  const run = vi.fn(async () => ({
    exitCode: 0,
    stdout: '',
    stderr: '',
  }));
  const session = {
    id: 'sandbox-1',
    defaultWorkingDirectory: '/work',
    ports: [],
    getPortEndpoint: async () => ({ url: 'ws://example.test/' }),
    getPortUrl: async () => 'ws://example.test/',
    run,
    stop: vi.fn(async () => {}),
    destroy: vi.fn(async () => {}),
    restricted: () => ({ run }) as never,
  } as unknown as HarnessV1NetworkSandboxSession;

  return {
    specificationVersion: 'harness-sandbox-v1',
    providerId: 'mock-sandbox',
    createSession: async () => session,
    resumeSession: async () => session,
  };
}

function createScoreAgent(text: string) {
  return new HarnessAgent({
    harness: createOutputHarness(text),
    sandbox: createSandboxProvider(),
    output: Output.object({
      schema: jsonSchema<ScoreOutput>(
        {
          type: 'object',
          properties: {
            score: { type: 'number' },
          },
          required: ['score'],
          additionalProperties: false,
        },
        {
          validate(value) {
            return typeof value === 'object' &&
              value != null &&
              typeof (value as { score?: unknown }).score === 'number'
              ? {
                  success: true,
                  value: value as ScoreOutput,
                }
              : {
                  success: false,
                  error: new Error('score must be a number'),
                };
          },
        },
      ),
    }),
  });
}

function collectingWritable() {
  const chunks: HarnessWorkflowChunk[] = [];
  let closed = false;
  const writable = new WritableStream<HarnessWorkflowChunk>({
    write(chunk) {
      chunks.push(chunk);
    },
    close() {
      closed = true;
    },
  });
  return { writable, chunks, isClosed: () => closed };
}

function fakeSession(options: {
  unfinishedTurn?: boolean;
  suspendState?: HarnessV1ContinueTurnState;
}) {
  const session = {
    sessionId: 'session-1',
    destroyCalls: 0,
    detachCalls: 0,
    hasUnfinishedTurn: () => options.unfinishedTurn ?? false,
    async suspendTurn() {
      return (
        options.suspendState ?? {
          type: 'continue-turn',
          harnessId: 'mock',
          specificationVersion: 'harness-v1',
          data: {},
        }
      );
    },
    async detach() {
      session.detachCalls++;
      return {
        type: 'resume-session',
        harnessId: 'mock',
        specificationVersion: 'harness-v1',
        data: {},
      };
    },
    async destroy() {
      session.destroyCalls++;
    },
  } as unknown as HarnessAgentSession & {
    destroyCalls: number;
    detachCalls: number;
  };
  return session;
}

function streamResult<OUTPUT>(options: {
  output: () => PromiseLike<OUTPUT>;
}): HarnessWorkflowStreamResult<OUTPUT> {
  return {
    toUIMessageStream() {
      return new ReadableStream<HarnessWorkflowChunk>({
        start(controller) {
          controller.enqueue({ type: 'start' });
          controller.close();
        },
      });
    },
    finishReason: Promise.resolve('stop'),
    totalUsage: Promise.resolve(undefined),
    get output() {
      return options.output();
    },
  };
}

describe('runHarnessAgentStep output', () => {
  test('persists parsed and schema-validated HarnessAgent output', async () => {
    const writable = collectingWritable();

    const state = await runHarnessAgentStep({
      agent: createScoreAgent('{"score":3}'),
      state: createHarnessWorkflowState({
        prompt: 'Score this.',
        sessionId: 'session-1',
      }),
      writable: writable.writable,
    });

    expect(state).toMatchObject({
      status: 'finished',
      finalResult: {
        output: { score: 3 },
      },
    });
    expect(writable.isClosed()).toBe(true);
  });

  test.each([
    {
      name: 'malformed JSON',
      text: 'not json',
      message: 'No object generated: could not parse the response.',
    },
    {
      name: 'schema-invalid JSON',
      text: '{"score":"three"}',
      message: 'No object generated: response did not match schema.',
    },
  ])('fails the workflow for $name', async ({ text, message }) => {
    const writable = collectingWritable();

    const state = await runHarnessAgentStep({
      agent: createScoreAgent(text),
      state: createHarnessWorkflowState({
        prompt: 'Score this.',
        sessionId: 'session-1',
      }),
      writable: writable.writable,
    });

    expect(state.status).toBe('failed');
    expect(state.error).toBe(message);
    expect(state.finalResult).toBeUndefined();
    expect(writable.isClosed()).toBe(false);
  });

  test('does not read output when the agent has no output capability', async () => {
    const session = fakeSession({});
    const readOutput = vi.fn(() => Promise.reject(new Error('not configured')));
    const result = streamResult({ output: readOutput });
    const agent: HarnessWorkflowAgent<string> = {
      createSession: vi.fn(async () => session),
      stream: vi.fn(async () => result),
      continueStream: vi.fn(async () => result),
    };

    const state = await runHarnessAgentStep({
      agent,
      state: createHarnessWorkflowState({
        prompt: 'Hello.',
        sessionId: 'session-1',
      }),
      writable: collectingWritable().writable,
    });

    expect(state.status).toBe('finished');
    expect(state.finalResult?.output).toBeUndefined();
    expect(readOutput).not.toHaveBeenCalled();
  });

  test('finishes a text-only HarnessAgent turn without reading output', async () => {
    const agent = new HarnessAgent({
      harness: createOutputHarness('Hello.'),
      sandbox: createSandboxProvider(),
    });

    const state = await runHarnessAgentStep({
      agent,
      state: createHarnessWorkflowState({
        prompt: 'Say hello.',
        sessionId: 'session-1',
      }),
      writable: collectingWritable().writable,
    });

    expect(state.status).toBe('finished');
    expect(state.finalResult?.output).toBeUndefined();
  });

  test('does not read output while the turn is unfinished', async () => {
    const continueFrom: HarnessV1ContinueTurnState = {
      type: 'continue-turn',
      harnessId: 'mock',
      specificationVersion: 'harness-v1',
      data: {},
    };
    const session = fakeSession({
      unfinishedTurn: true,
      suspendState: continueFrom,
    });
    const readOutput = vi.fn(() => Promise.resolve({ score: 3 }));
    const result = streamResult({ output: readOutput });
    const agent: HarnessWorkflowAgent<ScoreOutput> = {
      hasOutput: false,
      createSession: vi.fn(async () => session),
      stream: vi.fn(async () => result),
      continueStream: vi.fn(async () => result),
    };

    const state = await runHarnessAgentStep({
      agent,
      state: createHarnessWorkflowState({
        prompt: 'Score this.',
        sessionId: 'session-1',
      }),
      writable: collectingWritable().writable,
    });

    expect(state.status).toBe('ready_for_next_step');
    expect(readOutput).not.toHaveBeenCalled();
  });

  test('does not read output while a host tool result is pending', async () => {
    const continueFrom: HarnessV1ContinueTurnState = {
      type: 'continue-turn',
      harnessId: 'mock',
      specificationVersion: 'harness-v1',
      data: {},
      pendingToolResults: [
        {
          toolCallId: 'call-1',
          toolName: 'getScore',
          input: '{}',
        },
      ],
    };
    const session = fakeSession({
      unfinishedTurn: true,
      suspendState: continueFrom,
    });
    const readOutput = vi.fn(() => Promise.resolve({ score: 3 }));
    const result = streamResult({ output: readOutput });
    const agent: HarnessWorkflowAgent<ScoreOutput> = {
      hasOutput: true,
      createSession: vi.fn(async () => session),
      stream: vi.fn(async () => result),
      continueStream: vi.fn(async () => result),
    };

    const state = await runHarnessAgentStep({
      agent,
      state: createHarnessWorkflowState({
        prompt: 'Score this.',
        sessionId: 'session-1',
      }),
      writable: collectingWritable().writable,
    });

    expect(state.status).toBe('awaiting_tool_approval');
    expect(readOutput).not.toHaveBeenCalled();
    expect(state.finalResult?.output).toBeUndefined();
  });

  test('detaches the session and preserves the output error before closing the stream', async () => {
    const session = fakeSession({});
    const result = streamResult<ScoreOutput>({
      output: () => Promise.reject(new Error('output validation failed')),
    });
    const agent: HarnessWorkflowAgent<ScoreOutput> = {
      hasOutput: true,
      createSession: vi.fn(async () => session),
      stream: vi.fn(async () => result),
      continueStream: vi.fn(async () => result),
    };
    const writable = collectingWritable();

    const state = await runHarnessAgentStep({
      agent,
      state: createHarnessWorkflowState({
        prompt: 'Score this.',
        sessionId: 'session-1',
      }),
      writable: writable.writable,
    });

    expect(state).toMatchObject({
      status: 'failed',
      error: 'output validation failed',
      resumeFrom: {
        type: 'resume-session',
      },
    });
    expect(session.detachCalls).toBe(1);
    expect(session.destroyCalls).toBe(0);
    expect(writable.isClosed()).toBe(false);
    expect(writable.chunks.at(-1)).not.toMatchObject({ type: 'finish' });
  });

  test('destroys the session when output validation fails with destroyOnFinish', async () => {
    const session = fakeSession({});
    const result = streamResult<ScoreOutput>({
      output: () => Promise.reject(new Error('output validation failed')),
    });
    const agent: HarnessWorkflowAgent<ScoreOutput> = {
      hasOutput: true,
      createSession: vi.fn(async () => session),
      stream: vi.fn(async () => result),
      continueStream: vi.fn(async () => result),
    };

    const state = await runHarnessAgentStep({
      agent,
      state: createHarnessWorkflowState({
        prompt: 'Score this.',
        sessionId: 'session-1',
      }),
      destroyOnFinish: true,
      writable: collectingWritable().writable,
    });

    expect(state.status).toBe('failed');
    expect(state.resumeFrom).toBeUndefined();
    expect(session.detachCalls).toBe(0);
    expect(session.destroyCalls).toBe(1);
  });
});
