import { describe, expect, test, vi } from 'vitest';
import type {
  HarnessV1ContinueTurnState,
  HarnessV1ResumeSessionState,
} from '@ai-sdk/harness';
import type { HarnessAgentSession } from '@ai-sdk/harness/agent';
import { readUIMessageStream, type UIMessage, type UIMessageChunk } from 'ai';
import {
  createHarnessWorkflowState,
  type HarnessWorkflowModelMessage,
} from './harness-workflow-state';
import {
  type HarnessWorkflowAgent,
  type HarnessWorkflowChunk,
  type HarnessWorkflowStreamResult,
} from './run-harness-agent';
import { runHarnessAgentSlice } from './run-harness-agent-slice';
import { runHarnessAgentStep } from './run-harness-agent-step';
import { runHarnessAgentTimeSlice } from './run-harness-agent-time-slice';

function resumeState(tag: string): HarnessV1ResumeSessionState {
  return {
    type: 'resume-session',
    harnessId: 'mock',
    specificationVersion: 'harness-v1',
    data: { tag },
  };
}

function continueState(tag: string): HarnessV1ContinueTurnState {
  return {
    type: 'continue-turn',
    harnessId: 'mock',
    specificationVersion: 'harness-v1',
    data: { tag },
  };
}

function fakeSession(
  options: {
    unfinishedTurn?: boolean;
    suspendState?: HarnessV1ContinueTurnState;
  } = {},
): HarnessAgentSession & {
  suspendCalls: number;
  detachCalls: number;
  stopCalls: number;
  destroyCalls: number;
} {
  const session = {
    sessionId: 'ses_1',
    suspendCalls: 0,
    detachCalls: 0,
    stopCalls: 0,
    destroyCalls: 0,
    hasUnfinishedTurn() {
      return options.unfinishedTurn ?? false;
    },
    async suspendTurn() {
      session.suspendCalls++;
      return options.suspendState ?? continueState('suspended');
    },
    async detach() {
      session.detachCalls++;
      return resumeState('detached');
    },
    async stop() {
      session.stopCalls++;
      return resumeState('stopped');
    },
    async destroy() {
      session.destroyCalls++;
    },
  } as unknown as HarnessAgentSession & {
    suspendCalls: number;
    detachCalls: number;
    stopCalls: number;
    destroyCalls: number;
  };
  return session;
}

/**
 * A stream result whose chunks are emitted from a fixed list, then either ends
 * or blocks until the session is suspended.
 */
function streamResult(opts: {
  chunks: HarnessWorkflowChunk[];
  blockAfter?: boolean;
  finishReason?: unknown;
  totalUsage?: unknown;
}): { result: HarnessWorkflowStreamResult; closeForSuspend: () => void } {
  let close!: () => void;
  const result: HarnessWorkflowStreamResult = {
    toUIMessageStream() {
      return new ReadableStream<HarnessWorkflowChunk>({
        start(controller) {
          for (const chunk of opts.chunks) controller.enqueue(chunk);
          if (!opts.blockAfter) {
            controller.close();
            return;
          }
          close = () => {
            try {
              controller.close();
            } catch {
              /* already closed */
            }
          };
        },
      });
    },
    finishReason: Promise.resolve(opts.finishReason ?? 'stop'),
    totalUsage: Promise.resolve(
      opts.totalUsage ?? {
        inputTokens: { total: 11 },
        outputTokens: { total: 7 },
      },
    ),
  };
  return { result, closeForSuspend: () => close?.() };
}

function collectingWritable(): {
  writable: WritableStream<HarnessWorkflowChunk>;
  chunks: HarnessWorkflowChunk[];
  isClosed: () => boolean;
} {
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

async function consumeUIMessageChunks(options: {
  chunks: HarnessWorkflowChunk[];
  message?: UIMessage;
}): Promise<UIMessage | undefined> {
  let lastMessage = options.message;
  const stream = new ReadableStream<UIMessageChunk>({
    start(controller) {
      for (const chunk of options.chunks) {
        controller.enqueue(chunk as UIMessageChunk);
      }
      controller.close();
    },
  });

  for await (const message of readUIMessageStream({
    message: options.message,
    stream,
    terminateOnError: true,
  })) {
    lastMessage = message;
  }

  return lastMessage;
}

describe('runHarnessAgentTimeSlice', () => {
  test('first turn finishes: streams chunks, writes one terminal finish, keeps the session warm', async () => {
    const session = fakeSession();
    const { result } = streamResult({
      chunks: [
        { type: 'start' },
        { type: 'text-start', id: 't1' },
        { type: 'text-delta', id: 't1', delta: 'done' },
        { type: 'finish' }, // intermediate finish from the stream — dropped
      ],
      finishReason: 'stop',
    });

    const agent: HarnessWorkflowAgent = {
      createSession: vi.fn(async () => session),
      stream: vi.fn(async () => result),
      continueStream: vi.fn(async () => {
        throw new Error('continue should not be called on the first turn');
      }),
    };

    const { writable, chunks, isClosed } = collectingWritable();
    const state = createHarnessWorkflowState({
      prompt: 'hi',
      sessionId: 'ses_1',
    });
    expect(state.status).toBe('not_started');
    const next = await runHarnessAgentTimeSlice({
      agent,
      state,
      writable,
    });

    expect(agent.createSession).toHaveBeenCalledWith({ sessionId: 'ses_1' });
    expect(agent.stream).toHaveBeenCalledTimes(1);
    expect(next.status).toBe('finished');
    // A finished turn CLOSES the output stream — this is what lets the run's
    // readable terminate so the consumer's response ends (input re-enables).
    expect(isClosed()).toBe(true);
    expect(next.finalResult).toEqual({
      sessionId: 'ses_1',
      finishReason: 'stop',
      usage: { inputTokens: 11, outputTokens: 7 },
    });
    // Default parks the session for the next user turn and hands back fresh
    // resume state. It must NOT destroy the sandbox.
    expect(session.destroyCalls).toBe(0);
    expect(session.detachCalls).toBe(1);
    expect(session.stopCalls).toBe(0);
    expect(next.resumeFrom).toEqual(resumeState('detached'));
    expect(chunks.map(c => c.type)).toEqual([
      'start',
      'text-start',
      'text-delta',
      'finish',
    ]);
  });

  test('destroyOnFinish destroys the sandbox and drops resume state', async () => {
    const session = fakeSession();
    const { result } = streamResult({ chunks: [{ type: 'start' }] });
    const agent: HarnessWorkflowAgent = {
      createSession: vi.fn(async () => session),
      stream: vi.fn(async () => result),
      continueStream: vi.fn(async () => result),
    };

    const { writable } = collectingWritable();
    const next = await runHarnessAgentTimeSlice({
      agent,
      state: createHarnessWorkflowState({ prompt: 'hi', sessionId: 'ses_1' }),
      destroyOnFinish: true,
      writable,
    });

    expect(next.status).toBe('finished');
    expect(session.destroyCalls).toBe(1);
    expect(session.detachCalls).toBe(0);
    expect(session.stopCalls).toBe(0);
    expect(next.resumeFrom).toBeUndefined();
  });

  test('tool approval pause suspends the turn and closes the response stream', async () => {
    const continueFrom: HarnessV1ContinueTurnState = {
      ...continueState('suspended'),
      pendingToolApprovals: [
        {
          approvalId: 'a1',
          toolCallId: 'c1',
          toolName: 'weather',
          input: '{}',
          kind: 'custom',
          providerExecuted: false,
        },
      ],
    };
    const session = fakeSession({
      unfinishedTurn: true,
      suspendState: continueFrom,
    });
    const { result } = streamResult({
      chunks: [
        { type: 'start' },
        { type: 'tool-call', toolCallId: 'c1', toolName: 'weather' },
        { type: 'tool-approval-request', approvalId: 'a1' },
      ],
      finishReason: 'tool-calls',
    });
    const agent: HarnessWorkflowAgent = {
      createSession: vi.fn(async () => session),
      stream: vi.fn(async () => result),
      continueStream: vi.fn(async () => result),
    };

    const { writable, isClosed } = collectingWritable();
    const next = await runHarnessAgentTimeSlice({
      agent,
      state: createHarnessWorkflowState({ prompt: 'hi', sessionId: 'ses_1' }),
      writable,
    });

    expect(next.status).toBe('awaiting_tool_approval');
    expect(next.continueFrom).toEqual(continueFrom);
    expect(next.resumeFrom).toEqual({
      type: 'resume-session',
      harnessId: 'mock',
      specificationVersion: 'harness-v1',
      data: { tag: 'suspended' },
      continueFrom,
    });
    expect(session.suspendCalls).toBe(1);
    expect(session.detachCalls).toBe(0);
    expect(session.destroyCalls).toBe(0);
    expect(isClosed()).toBe(true);
  });

  test('new user turn resumes the warm session and sends the prompt (multi-turn)', async () => {
    const session = fakeSession();
    const { result } = streamResult({
      chunks: [
        { type: 'start' },
        { type: 'text-delta', id: 't', delta: 'hey' },
      ],
    });

    const agent: HarnessWorkflowAgent = {
      createSession: vi.fn(async () => session),
      stream: vi.fn(async () => result),
      continueStream: vi.fn(async () => {
        throw new Error('continue should not be called for a new user turn');
      }),
    };

    const { writable } = collectingWritable();
    // A subsequent user turn resumes the warm session and sends the new prompt.
    const next = await runHarnessAgentTimeSlice({
      agent,
      state: createHarnessWorkflowState({
        prompt: 'turn 2',
        sessionId: 'ses_1',
        resumeFrom: resumeState('prior-run'),
      }),
      writable,
    });

    expect(agent.createSession).toHaveBeenCalledWith({
      sessionId: 'ses_1',
      resumeFrom: resumeState('prior-run'),
    });
    expect(agent.stream).toHaveBeenCalledWith({ session, prompt: 'turn 2' });
    expect(next.status).toBe('finished');
  });

  test('completes the time slice: suspends at the budget and carries the cursor forward', async () => {
    const session = fakeSession({ unfinishedTurn: true });
    const { result, closeForSuspend } = streamResult({
      chunks: [{ type: 'start' }, { type: 'text-delta', id: 't', delta: 'a' }],
      blockAfter: true,
    });
    const suspendingSession = session as unknown as {
      suspendTurn: () => Promise<HarnessV1ContinueTurnState>;
    };
    const originalSuspend = suspendingSession.suspendTurn.bind(session);
    suspendingSession.suspendTurn = async () => {
      closeForSuspend();
      return originalSuspend();
    };

    const agent: HarnessWorkflowAgent = {
      createSession: vi.fn(async () => session),
      stream: vi.fn(async () => result),
      continueStream: vi.fn(async () => result),
    };

    const { writable, isClosed } = collectingWritable();
    const next = await runHarnessAgentTimeSlice({
      agent,
      state: createHarnessWorkflowState({ prompt: 'hi', sessionId: 'ses_1' }),
      timeSliceSeconds: 0.05,
      writable,
    });

    expect(next.status).toBe('ready_for_next_step');
    expect(next.continueFrom).toEqual(continueState('suspended'));
    expect(session.suspendCalls).toBe(1);
    // A suspended slice must NOT destroy the sandbox — the next slice attaches.
    expect(session.destroyCalls).toBe(0);
    // It must also NOT close the output stream — the next slice keeps writing
    // to the same run stream; closing here would end the response mid-turn.
    expect(isClosed()).toBe(false);
  });

  test('finishes normally when the turn completes before the time-slice deadline while the stream remains open', async () => {
    vi.useFakeTimers();
    try {
      const sessionOptions = { unfinishedTurn: true };
      const session = fakeSession(sessionOptions);
      let closeStream!: () => void;
      let resolveStreamStarted!: () => void;
      const streamStarted = new Promise<void>(resolve => {
        resolveStreamStarted = resolve;
      });
      const result: HarnessWorkflowStreamResult = {
        toUIMessageStream() {
          return new ReadableStream<HarnessWorkflowChunk>({
            start(controller) {
              controller.enqueue({ type: 'start' });
              controller.enqueue({
                type: 'text-delta',
                id: 't',
                delta: 'done',
              });
              closeStream = () => controller.close();
              resolveStreamStarted();
            },
          });
        },
        finishReason: Promise.resolve('stop'),
        totalUsage: Promise.resolve({
          inputTokens: { total: 11 },
          outputTokens: { total: 7 },
        }),
      };
      const agent: HarnessWorkflowAgent = {
        createSession: vi.fn(async () => session),
        stream: vi.fn(async () => result),
        continueStream: vi.fn(async () => result),
      };

      const { writable, isClosed } = collectingWritable();
      const runPromise = runHarnessAgentTimeSlice({
        agent,
        state: createHarnessWorkflowState({
          prompt: 'hi',
          sessionId: 'ses_1',
        }),
        timeSliceSeconds: 0.1,
        writable,
      });

      await streamStarted;
      sessionOptions.unfinishedTurn = false;
      await vi.advanceTimersByTimeAsync(100);
      closeStream();

      const next = await runPromise;
      expect(next.status).toBe('finished');
      expect(isClosed()).toBe(true);
      expect(session.suspendCalls).toBe(0);
      expect(session.detachCalls).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  test('mid-turn slice continues (no new prompt) and can finish', async () => {
    const session = fakeSession();
    const { result } = streamResult({
      chunks: [
        { type: 'start' }, // dropped on a continued slice
        { type: 'text-delta', id: 't', delta: 'more' },
      ],
    });

    const agent: HarnessWorkflowAgent = {
      createSession: vi.fn(async () => session),
      stream: vi.fn(async () => {
        throw new Error('stream should not be called on a continued slice');
      }),
      continueStream: vi.fn(async () => result),
    };

    const { writable, chunks } = collectingWritable();
    const next = await runHarnessAgentTimeSlice({
      agent,
      state: {
        sessionId: 'ses_1',
        prompt: 'hi',
        status: 'ready_for_next_step',
        continueFrom: continueState('cursor'),
      },
      writable,
    });

    expect(agent.continueStream).toHaveBeenCalledTimes(1);
    expect(agent.createSession).toHaveBeenCalledWith({
      sessionId: 'ses_1',
      continueFrom: continueState('cursor'),
    });
    expect(next.status).toBe('finished');
    // The opening `start` is dropped on a continued slice; one terminal finish.
    expect(chunks.map(c => c.type)).toEqual(['text-delta', 'finish']);
  });

  test('continued slice reopens active parts and preserves aggregate token usage', async () => {
    const firstSession = fakeSession({ unfinishedTurn: true });
    const { result: firstResult, closeForSuspend } = streamResult({
      chunks: [
        { type: 'start' },
        { type: 'text-start', id: 't1' },
        { type: 'text-delta', id: 't1', delta: 'first' },
        { type: 'reasoning-start', id: 'r1' },
        { type: 'reasoning-delta', id: 'r1', delta: 'think' },
      ],
      blockAfter: true,
    });
    const suspendingSession = firstSession as unknown as {
      suspendTurn: () => Promise<HarnessV1ContinueTurnState>;
    };
    const originalSuspend = suspendingSession.suspendTurn.bind(firstSession);
    suspendingSession.suspendTurn = async () => {
      closeForSuspend();
      return originalSuspend();
    };

    const firstAgent: HarnessWorkflowAgent = {
      createSession: vi.fn(async () => firstSession),
      stream: vi.fn(async () => firstResult),
      continueStream: vi.fn(async () => {
        throw new Error('continue should not be called on the first slice');
      }),
    };
    const firstWritable = collectingWritable();

    const readyForNextStep = await runHarnessAgentTimeSlice({
      agent: firstAgent,
      state: createHarnessWorkflowState({ prompt: 'hi', sessionId: 'ses_1' }),
      timeSliceSeconds: 0.05,
      writable: firstWritable.writable,
    });

    expect(readyForNextStep.status).toBe('ready_for_next_step');
    expect(firstWritable.chunks.map(c => c.type)).toEqual([
      'start',
      'text-start',
      'text-delta',
      'reasoning-start',
      'reasoning-delta',
      'text-end',
      'reasoning-end',
    ]);

    const secondSession = fakeSession();
    const { result: secondResult } = streamResult({
      chunks: [
        { type: 'start' },
        { type: 'text-delta', id: 't1', delta: ' second' },
        { type: 'text-end', id: 't1' },
        { type: 'reasoning-delta', id: 'r1', delta: ' more' },
        { type: 'reasoning-end', id: 'r1' },
      ],
      totalUsage: {
        inputTokens: 120,
        outputTokens: 30,
      },
    });
    const secondAgent: HarnessWorkflowAgent = {
      createSession: vi.fn(async () => secondSession),
      stream: vi.fn(async () => {
        throw new Error('stream should not be called on a continued slice');
      }),
      continueStream: vi.fn(async () => secondResult),
    };
    const secondWritable = collectingWritable();

    const finished = await runHarnessAgentTimeSlice({
      agent: secondAgent,
      state: readyForNextStep,
      writable: secondWritable.writable,
    });

    expect(finished.status).toBe('finished');
    expect(finished.finalResult?.usage).toEqual({
      inputTokens: 120,
      outputTokens: 30,
    });
    expect(secondWritable.chunks.map(c => c.type)).toEqual([
      'text-start',
      'text-delta',
      'text-end',
      'reasoning-start',
      'reasoning-delta',
      'reasoning-end',
      'finish',
    ]);
  });

  test('continued slice emits a pending tool input only once across the time-slice boundary', async () => {
    const firstSession = fakeSession({ unfinishedTurn: true });
    const { result: firstResult, closeForSuspend } = streamResult({
      chunks: [
        { type: 'start' },
        { type: 'start-step' },
        {
          type: 'tool-input-available',
          toolCallId: 'call_1',
          toolName: 'write',
          input: { path: 'app/page.tsx' },
          providerExecuted: true,
        },
      ],
      blockAfter: true,
    });
    const suspendingSession = firstSession as unknown as {
      suspendTurn: () => Promise<HarnessV1ContinueTurnState>;
    };
    const originalSuspend = suspendingSession.suspendTurn.bind(firstSession);
    suspendingSession.suspendTurn = async () => {
      closeForSuspend();
      return originalSuspend();
    };

    const firstAgent: HarnessWorkflowAgent = {
      createSession: vi.fn(async () => firstSession),
      stream: vi.fn(async () => firstResult),
      continueStream: vi.fn(async () => {
        throw new Error('continue should not be called on the first slice');
      }),
    };

    const firstWritable = collectingWritable();
    const readyForNextStep = await runHarnessAgentTimeSlice({
      agent: firstAgent,
      state: createHarnessWorkflowState({ prompt: 'hi', sessionId: 'ses_1' }),
      timeSliceSeconds: 0.05,
      writable: firstWritable.writable,
    });

    const secondSession = fakeSession();
    const { result: secondResult } = streamResult({
      chunks: [
        { type: 'start' },
        { type: 'start-step' },
        {
          type: 'tool-output-available',
          toolCallId: 'call_1',
          output: 'done',
          providerExecuted: true,
        },
      ],
    });
    const secondAgent: HarnessWorkflowAgent = {
      createSession: vi.fn(async () => secondSession),
      stream: vi.fn(async () => {
        throw new Error('stream should not be called on a continued slice');
      }),
      continueStream: vi.fn(async () => secondResult),
    };
    const secondWritable = collectingWritable();

    const finished = await runHarnessAgentTimeSlice({
      agent: secondAgent,
      state: readyForNextStep,
      writable: secondWritable.writable,
    });

    expect(finished.status).toBe('finished');
    expect([...firstWritable.chunks, ...secondWritable.chunks]).toEqual([
      { type: 'start' },
      { type: 'start-step' },
      {
        type: 'tool-input-available',
        toolCallId: 'call_1',
        toolName: 'write',
        input: { path: 'app/page.tsx' },
        providerExecuted: true,
      },
      { type: 'start-step' },
      {
        type: 'tool-output-available',
        toolCallId: 'call_1',
        output: 'done',
        providerExecuted: true,
      },
      { type: 'finish' },
    ]);
  });

  test('continued slice reconstructs a partial tool input without creating a duplicate UI part', async () => {
    const firstSession = fakeSession({ unfinishedTurn: true });
    const { result: firstResult, closeForSuspend } = streamResult({
      chunks: [
        { type: 'start', messageId: 'message_1' },
        { type: 'start-step' },
        {
          type: 'tool-input-start',
          toolCallId: 'call_1',
          toolName: 'write',
          providerExecuted: true,
        },
        {
          type: 'tool-input-delta',
          toolCallId: 'call_1',
          inputTextDelta: '{"path":',
        },
      ],
      blockAfter: true,
    });
    const suspendingSession = firstSession as unknown as {
      suspendTurn: () => Promise<HarnessV1ContinueTurnState>;
    };
    const originalSuspend = suspendingSession.suspendTurn.bind(firstSession);
    suspendingSession.suspendTurn = async () => {
      closeForSuspend();
      return originalSuspend();
    };

    const firstWritable = collectingWritable();
    const readyForNextStep = await runHarnessAgentTimeSlice({
      agent: {
        createSession: vi.fn(async () => firstSession),
        stream: vi.fn(async () => firstResult),
        continueStream: vi.fn(async () => {
          throw new Error('continue should not be called on the first slice');
        }),
      },
      state: createHarnessWorkflowState({ prompt: 'hi', sessionId: 'ses_1' }),
      timeSliceSeconds: 0.05,
      writable: firstWritable.writable,
    });

    expect(readyForNextStep.streamContext?.activeToolInputs).toEqual({
      call_1: {
        start: {
          type: 'tool-input-start',
          toolCallId: 'call_1',
          toolName: 'write',
          providerExecuted: true,
        },
        text: '{"path":',
      },
    });

    const firstMessage = await consumeUIMessageChunks({
      chunks: firstWritable.chunks,
    });

    const secondSession = fakeSession({ unfinishedTurn: true });
    const { result: secondResult, closeForSuspend: closeSecondForSuspend } =
      streamResult({
        chunks: [
          { type: 'start' },
          { type: 'start-step' },
          {
            type: 'tool-input-delta',
            toolCallId: 'call_1',
            inputTextDelta: '"app/page.tsx"}',
          },
          {
            type: 'tool-input-available',
            toolCallId: 'call_1',
            toolName: 'write',
            input: { path: 'app/page.tsx' },
            providerExecuted: true,
          },
        ],
        blockAfter: true,
      });
    const secondSuspendingSession = secondSession as unknown as {
      suspendTurn: () => Promise<HarnessV1ContinueTurnState>;
    };
    const originalSecondSuspend =
      secondSuspendingSession.suspendTurn.bind(secondSession);
    secondSuspendingSession.suspendTurn = async () => {
      closeSecondForSuspend();
      return originalSecondSuspend();
    };
    const secondWritable = collectingWritable();
    const secondReadyForNextStep = await runHarnessAgentTimeSlice({
      agent: {
        createSession: vi.fn(async () => secondSession),
        stream: vi.fn(async () => {
          throw new Error('stream should not be called on a continued slice');
        }),
        continueStream: vi.fn(async () => secondResult),
      },
      state: readyForNextStep,
      timeSliceSeconds: 0.05,
      writable: secondWritable.writable,
    });

    expect(secondReadyForNextStep.status).toBe('ready_for_next_step');
    expect(
      secondReadyForNextStep.streamContext?.activeToolInputs,
    ).toBeUndefined();
    expect(secondWritable.chunks).toEqual([
      {
        type: 'tool-input-start',
        toolCallId: 'call_1',
        toolName: 'write',
        providerExecuted: true,
      },
      {
        type: 'tool-input-delta',
        toolCallId: 'call_1',
        inputTextDelta: '{"path":',
      },
      {
        type: 'tool-input-delta',
        toolCallId: 'call_1',
        inputTextDelta: '"app/page.tsx"}',
      },
      {
        type: 'tool-input-available',
        toolCallId: 'call_1',
        toolName: 'write',
        input: { path: 'app/page.tsx' },
        providerExecuted: true,
      },
    ]);

    const completedMessage = await consumeUIMessageChunks({
      chunks: secondWritable.chunks,
      message: firstMessage,
    });
    const toolParts = completedMessage?.parts.filter(part =>
      'toolCallId' in part ? part.toolCallId === 'call_1' : false,
    );
    expect(toolParts).toHaveLength(1);
    expect(toolParts?.[0]).toMatchObject({
      toolCallId: 'call_1',
      state: 'input-available',
      input: { path: 'app/page.tsx' },
    });
  });

  test('tool input errors clear partial input state', async () => {
    const session = fakeSession({ unfinishedTurn: true });
    const { result, closeForSuspend } = streamResult({
      chunks: [
        {
          type: 'tool-input-error',
          toolCallId: 'call_1',
          toolName: 'write',
          input: '{"path":',
          errorText: 'invalid input',
          providerExecuted: true,
        },
      ],
      blockAfter: true,
    });
    const suspendingSession = session as unknown as {
      suspendTurn: () => Promise<HarnessV1ContinueTurnState>;
    };
    const originalSuspend = suspendingSession.suspendTurn.bind(session);
    suspendingSession.suspendTurn = async () => {
      closeForSuspend();
      return originalSuspend();
    };

    const next = await runHarnessAgentTimeSlice({
      agent: {
        createSession: vi.fn(async () => session),
        stream: vi.fn(async () => {
          throw new Error('stream should not be called on a continued slice');
        }),
        continueStream: vi.fn(async () => result),
      },
      state: {
        sessionId: 'ses_1',
        prompt: 'hi',
        status: 'ready_for_next_step',
        continueFrom: continueState('cursor'),
        streamContext: {
          activeToolInputs: {
            call_1: {
              start: {
                type: 'tool-input-start',
                toolCallId: 'call_1',
                toolName: 'write',
              },
              text: '{"path":',
            },
          },
        },
      },
      timeSliceSeconds: 0.05,
      writable: collectingWritable().writable,
    });

    expect(next.status).toBe('ready_for_next_step');
    expect(next.streamContext?.activeToolInputs).toBeUndefined();
  });

  test('approval response messages resume through stream messages', async () => {
    const session = fakeSession();
    const { result } = streamResult({ chunks: [{ type: 'start' }] });
    const messages: HarnessWorkflowModelMessage[] = [
      {
        role: 'tool',
        content: [
          {
            type: 'tool-approval-response',
            approvalId: 'a1',
            approved: true,
          },
        ],
      },
    ];
    const agent: HarnessWorkflowAgent = {
      createSession: vi.fn(async () => session),
      stream: vi.fn(async () => result),
      continueStream: vi.fn(async () => {
        throw new Error('continue should not be called for approval messages');
      }),
    };

    const { writable } = collectingWritable();
    const next = await runHarnessAgentTimeSlice({
      agent,
      state: createHarnessWorkflowState({
        messages,
        sessionId: 'ses_1',
        continueFrom: continueState('approval'),
      }),
      writable,
    });

    expect(agent.stream).toHaveBeenCalledWith({ session, messages });
    expect(agent.continueStream).not.toHaveBeenCalled();
    expect(next.status).toBe('finished');
    expect('messages' in next).toBe(false);
  });
});

describe('runHarnessAgentStep', () => {
  test('returns ready_for_next_step when a semantic step ends before the turn', async () => {
    const session = fakeSession({ unfinishedTurn: true });
    const { result } = streamResult({
      chunks: [
        { type: 'start' },
        { type: 'text-start', id: 't1' },
        { type: 'text-delta', id: 't1', delta: 'working' },
      ],
      finishReason: 'tool-calls',
    });
    const agent: HarnessWorkflowAgent = {
      createSession: vi.fn(async () => session),
      stream: vi.fn(async () => result),
      continueStream: vi.fn(async () => result),
    };

    const { writable, chunks, isClosed } = collectingWritable();
    const next = await runHarnessAgentStep({
      agent,
      state: createHarnessWorkflowState({ prompt: 'hi', sessionId: 'ses_1' }),
      writable,
    });

    expect(next.status).toBe('ready_for_next_step');
    expect(next.continueFrom).toEqual(continueState('suspended'));
    expect(next.finalResult).toBeUndefined();
    expect(session.suspendCalls).toBe(1);
    expect(session.detachCalls).toBe(0);
    expect(session.destroyCalls).toBe(0);
    expect(isClosed()).toBe(false);
    expect(chunks.map(chunk => chunk.type)).toEqual([
      'start',
      'text-start',
      'text-delta',
      'text-end',
    ]);
  });

  test('continues a semantic step and finishes the completed turn', async () => {
    const session = fakeSession();
    const { result } = streamResult({
      chunks: [
        { type: 'start' },
        { type: 'text-delta', id: 't1', delta: 'done' },
      ],
      finishReason: 'stop',
    });
    const agent: HarnessWorkflowAgent = {
      createSession: vi.fn(async () => session),
      stream: vi.fn(async () => {
        throw new Error('stream should not be called on a continued step');
      }),
      continueStream: vi.fn(async () => result),
    };

    const { writable, chunks, isClosed } = collectingWritable();
    const next = await runHarnessAgentStep({
      agent,
      state: {
        sessionId: 'ses_1',
        prompt: 'hi',
        status: 'ready_for_next_step',
        continueFrom: continueState('cursor'),
      },
      writable,
    });

    expect(agent.createSession).toHaveBeenCalledWith({
      sessionId: 'ses_1',
      continueFrom: continueState('cursor'),
    });
    expect(agent.continueStream).toHaveBeenCalledTimes(1);
    expect(next.status).toBe('finished');
    expect(next.resumeFrom).toEqual(resumeState('detached'));
    expect(isClosed()).toBe(true);
    expect(chunks.map(chunk => chunk.type)).toEqual(['text-delta', 'finish']);
  });
});

describe('runHarnessAgentSlice', () => {
  test('supports sliceTimeoutSeconds and maps ready_for_next_step to timed_out', async () => {
    const session = fakeSession({ unfinishedTurn: true });
    const { result, closeForSuspend } = streamResult({
      chunks: [{ type: 'start' }],
      blockAfter: true,
    });
    const suspendingSession = session as unknown as {
      suspendTurn: () => Promise<HarnessV1ContinueTurnState>;
    };
    const originalSuspend = suspendingSession.suspendTurn.bind(session);
    suspendingSession.suspendTurn = async () => {
      closeForSuspend();
      return originalSuspend();
    };
    const agent: HarnessWorkflowAgent = {
      createSession: vi.fn(async () => session),
      stream: vi.fn(async () => result),
      continueStream: vi.fn(async () => result),
    };

    const next = await runHarnessAgentSlice({
      agent,
      state: createHarnessWorkflowState({ prompt: 'hi', sessionId: 'ses_1' }),
      sliceTimeoutSeconds: 0.05,
      writable: collectingWritable().writable,
    });

    expect(next.status).toBe('timed_out');
    expect(next.continueFrom).toEqual(continueState('suspended'));
  });
});
