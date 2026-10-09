import type { HarnessV1StreamPart } from '@ai-sdk/harness';
import { describe, expect, it, vi } from 'vitest';
import {
  takeParkedJcodeClient,
  type JcodeSdkClient,
  type JcodeSdkEvent,
} from './jcode-client';
import { createJcodeSession } from './jcode-session';

function iteratorFrom(
  events: JcodeSdkEvent[],
): AsyncIterableIterator<JcodeSdkEvent> {
  const iterator = (async function* () {
    yield* events;
  })();
  return iterator;
}

function fakeClient(events: JcodeSdkEvent[] = []): JcodeSdkClient & {
  sendMessage: ReturnType<typeof vi.fn>;
  cancel: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  detachSession: ReturnType<typeof vi.fn>;
} {
  return {
    instanceHome: '/durable/jcode',
    supports: vi.fn(() => true),
    createSession: vi.fn(async () => ({ session_id: 'native-1' })),
    attachSession: vi.fn(async id => ({ session_id: id })),
    detachSession: vi.fn(async () => {}),
    sendMessage: vi.fn(async () => {}),
    cancel: vi.fn(async () => {}),
    softInterrupt: vi.fn(async () => {}),
    compact: vi.fn(async () => 'compacted'),
    setModel: vi.fn(async () => {}),
    setReasoningEffort: vi.fn(async () => {}),
    setExternalTools: vi.fn(async () => {}),
    submitExternalToolResult: vi.fn(async () => {}),
    events: vi.fn(() => iteratorFrom(events)),
    close: vi.fn(async () => {}),
  };
}

describe('createJcodeSession', () => {
  it('registers, emits, and submits host-executed external tools', async () => {
    let releaseTurn: (() => void) | undefined;
    const client = fakeClient();
    client.events = vi.fn(() =>
      (async function* () {
        yield {
          ev: 'tool_start',
          session_id: 'native-1',
          call_id: 'call-1',
          name: 'weather',
        } as const;
        yield {
          ev: 'tool_input_delta',
          session_id: 'native-1',
          call_id: 'call-1',
          delta: '{"city":"Berlin"}',
        } as const;
        yield {
          ev: 'tool_exec',
          session_id: 'native-1',
          call_id: 'call-1',
          name: 'weather',
        } as const;
        yield {
          ev: 'external_tool_call',
          session_id: 'native-1',
          root_session_id: 'native-1',
          call_id: 'call-1',
          catalog_revision: 1,
          name: 'weather',
          input: { city: 'Berlin' },
        } as const;
        await new Promise<void>(resolve => {
          releaseTurn = resolve;
        });
        yield {
          ev: 'tool_done',
          session_id: 'native-1',
          call_id: 'call-1',
          name: 'weather',
          output: '{"temperature":18}',
        } as const;
        yield { ev: 'turn_done', session_id: 'native-1' } as const;
      })(),
    );
    const session = await createJcodeSession({
      client,
      sessionId: 'harness-1',
      sessionWorkDir: '/workspace',
    });
    const emitted: HarnessV1StreamPart[] = [];
    const control = await session.doPromptTurn({
      prompt: 'weather?',
      tools: [
        {
          name: 'weather',
          description: 'Get weather',
          inputSchema: { type: 'object' },
        },
      ],
      emit: part => emitted.push(part),
    });

    await vi.waitFor(() =>
      expect(emitted).toContainEqual({
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'weather',
        input: '{"city":"Berlin"}',
        providerExecuted: false,
        dynamic: false,
      }),
    );
    expect(client.setExternalTools).toHaveBeenCalledWith('native-1', [
      {
        name: 'weather',
        description: 'Get weather',
        input_schema: { type: 'object' },
      },
    ]);

    await control.submitToolResult({
      toolCallId: 'call-1',
      output: { temperature: 18 },
    });
    expect(client.submitExternalToolResult).toHaveBeenCalledWith('native-1', {
      call_id: 'call-1',
      output: { temperature: 18 },
      is_error: false,
    });
    releaseTurn?.();
    await control.done;
    expect(emitted.filter(part => part.type === 'tool-call')).toHaveLength(1);
    expect(emitted).toContainEqual({
      type: 'tool-result',
      toolCallId: 'call-1',
      toolName: 'weather',
      result: { temperature: 18 },
    });
  });

  it('clears the previous external tool catalog on a tool-free turn', async () => {
    const client = fakeClient([{ ev: 'turn_done', session_id: 'native-1' }]);
    const session = await createJcodeSession({
      client,
      sessionId: 'harness-1',
      sessionWorkDir: '/workspace',
    });
    const control = await session.doPromptTurn({
      prompt: 'hello',
      emit: () => {},
    });
    await control.done;
    expect(client.setExternalTools).toHaveBeenCalledWith('native-1', []);
  });
  it('streams a model-backed turn as typed harness parts', async () => {
    const client = fakeClient([
      { ev: 'reasoning_delta', session_id: 'native-1', text: 'Think' },
      { ev: 'reasoning_done', session_id: 'native-1' },
      { ev: 'text_delta', session_id: 'native-1', text: 'Hello' },
      {
        ev: 'token_usage',
        session_id: 'native-1',
        input: 10,
        output: 2,
        cache_read_input: 3,
      },
      { ev: 'turn_done', session_id: 'native-1' },
    ]);
    const session = await createJcodeSession({
      client,
      sessionId: 'harness-1',
      sessionWorkDir: '/workspace',
      model: 'openai:test',
      reasoningEffort: 'high',
    });
    const emitted: HarnessV1StreamPart[] = [];
    const control = await session.doPromptTurn({
      prompt: 'hello',
      emit: part => emitted.push(part),
    });
    await control.done;

    expect(client.sendMessage).toHaveBeenCalledWith('native-1', 'hello');
    expect(emitted.map(part => part.type)).toEqual([
      'stream-start',
      'reasoning-start',
      'reasoning-delta',
      'reasoning-end',
      'text-start',
      'text-delta',
      'text-end',
      'finish-step',
      'finish',
    ]);
    expect(emitted.at(-1)).toMatchObject({
      type: 'finish',
      totalUsage: {
        inputTokens: { total: 10, cacheRead: 3 },
        outputTokens: { total: 2 },
      },
    });
  });

  it('frames instructions only into the first fresh prompt', async () => {
    const client = fakeClient([{ ev: 'turn_done', session_id: 'native-1' }]);
    const session = await createJcodeSession({
      client,
      sessionId: 'harness-1',
      sessionWorkDir: '/workspace',
    });
    const first = await session.doPromptTurn({
      prompt: 'one',
      instructions: 'be concise',
      emit: () => {},
    });
    await first.done;

    expect(client.sendMessage.mock.calls[0]?.[1]).toContain(
      '<session-instructions>\nbe concise',
    );
  });

  it('returns durable native identity and closes on stop', async () => {
    const client = fakeClient();
    const session = await createJcodeSession({
      client,
      sessionId: 'harness-1',
      sessionWorkDir: '/workspace',
    });
    const state = await session.doStop();

    expect(state).toEqual({
      type: 'resume-session',
      harnessId: 'jcode',
      specificationVersion: 'harness-v1',
      data: {
        jcodeSessionId: 'native-1',
        jcodeHome: '/durable/jcode',
      },
    });
    expect(client.detachSession).toHaveBeenCalledWith('native-1');
    expect(client.close).toHaveBeenCalledOnce();
  });

  it('parks the live client for same-process resume on detach', async () => {
    const client = fakeClient();
    const session = await createJcodeSession({
      client,
      sessionId: 'harness-1',
      sessionWorkDir: '/workspace',
    });

    await session.doDetach();

    expect(client.close).not.toHaveBeenCalled();
    expect(takeParkedJcodeClient('native-1')).toBe(client);
  });

  it('cancels an active turn when aborted', async () => {
    let release: (() => void) | undefined;
    const client = fakeClient();
    client.events = vi.fn(() =>
      (async function* () {
        await new Promise<void>(resolve => {
          release = resolve;
        });
        yield { ev: 'turn_done', session_id: 'native-1' } as JcodeSdkEvent;
      })(),
    );
    const session = await createJcodeSession({
      client,
      sessionId: 'harness-1',
      sessionWorkDir: '/workspace',
    });
    const abort = new AbortController();
    const control = await session.doPromptTurn({
      prompt: 'wait',
      abortSignal: abort.signal,
      emit: () => {},
    });
    abort.abort();
    await vi.waitFor(() =>
      expect(client.cancel).toHaveBeenCalledWith('native-1'),
    );
    release?.();
    await control.done;
  });

  it('terminates immediately on a protocol error event', async () => {
    const client = fakeClient([
      {
        ev: 'error',
        code: 'internal',
        message: 'model failed',
      },
    ]);
    const session = await createJcodeSession({
      client,
      sessionId: 'harness-1',
      sessionWorkDir: '/workspace',
    });
    const emitted: HarnessV1StreamPart[] = [];
    const control = await session.doPromptTurn({
      prompt: 'fail',
      emit: part => emitted.push(part),
    });

    await expect(control.done).rejects.toThrow('internal: model failed');
    expect(emitted.filter(part => part.type === 'error')).toHaveLength(1);
  });

  it('rejects suspension instead of exporting unusable continuation state', async () => {
    const session = await createJcodeSession({
      client: fakeClient(),
      sessionId: 'harness-1',
      sessionWorkDir: '/workspace',
    });

    await expect(session.doSuspendTurn()).rejects.toThrow(
      'turn suspension requires event replay cursors',
    );
  });
});
