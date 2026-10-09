import { MockLanguageModelV4, convertArrayToReadableStream } from 'ai/test';
import { describe, expect, it, vi } from 'vitest';
import { WorkflowAgent } from './workflow-agent.js';

async function runAgentWithStreamError(
  terminal: unknown,
  onError?: (event: { error: unknown }) => void | Promise<void>,
) {
  const streamedParts: unknown[] = [];
  const onEnd = vi.fn();
  const model = new MockLanguageModelV4({
    doStream: async () => ({
      stream: convertArrayToReadableStream([
        { type: 'stream-start' as const, warnings: [] },
        { type: 'reasoning-start' as const, id: 'reasoning-1' },
        {
          type: 'reasoning-delta' as const,
          id: 'reasoning-1',
          delta: 'Thinking.',
        },
        { type: 'reasoning-end' as const, id: 'reasoning-1' },
        { type: 'text-start' as const, id: 'text-1' },
        {
          type: 'text-delta' as const,
          id: 'text-1',
          delta: 'A partial answer.',
        },
        { type: 'text-end' as const, id: 'text-1' },
        { type: 'error' as const, error: terminal },
        {
          type: 'finish' as const,
          finishReason: { unified: 'error' as const, raw: 'error' },
          usage: {
            inputTokens: {
              total: 1,
              noCache: 1,
              cacheRead: undefined,
              cacheWrite: undefined,
            },
            outputTokens: {
              total: 0,
              text: 0,
              reasoning: undefined,
            },
          },
        },
      ]),
    }),
  });
  const agent = new WorkflowAgent({ model });

  let didReject = false;
  let rejection: unknown;
  let streamResult: Awaited<ReturnType<(typeof agent)['stream']>> | undefined;

  try {
    streamResult = await agent.stream({
      messages: [{ role: 'user', content: 'trigger the terminal error' }],
      writable: new WritableStream({
        write(part) {
          streamedParts.push(part);
        },
      }),
      onError,
      onEnd,
    });
  } catch (error) {
    didReject = true;
    rejection = error;
  }

  return { didReject, rejection, streamResult, streamedParts, onEnd };
}

describe('WorkflowAgent.stream error parts', () => {
  it('forwards the error part and resolves with its original value', async () => {
    const terminal = new Error('terminal model error');

    const result = await runAgentWithStreamError(terminal);

    expect(result.didReject).toBe(false);
    expect(result.rejection).toBeUndefined();
    expect(result.streamResult).toMatchObject({
      finishReason: 'error',
      error: terminal,
    });
    expect(result.streamedParts).toContainEqual({
      type: 'error',
      error: terminal,
    });
    const assistantMessage = {
      role: 'assistant',
      content: [
        { type: 'reasoning', text: 'Thinking.' },
        { type: 'text', text: 'A partial answer.' },
      ],
    };
    expect(result.streamResult?.messages.at(-1)).toEqual(assistantMessage);
    expect(result.streamResult?.steps[0]?.response.messages).toEqual([
      assistantMessage,
    ]);
    expect(result.onEnd).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: result.streamResult?.messages,
        text: 'A partial answer.',
      }),
    );
  });

  it('preserves a falsy error value', async () => {
    const result = await runAgentWithStreamError(false);

    expect(result.didReject).toBe(false);
    expect(result.streamResult).toHaveProperty('error', false);
  });

  it('preserves the presence of an undefined error value', async () => {
    const result = await runAgentWithStreamError(undefined);

    expect(result.didReject).toBe(false);
    expect(result.streamResult).toHaveProperty('error', undefined);
  });

  it('calls onError once for a model stream error part', async () => {
    const terminal = new Error('terminal model error');
    const onError = vi.fn();

    await runAgentWithStreamError(terminal, onError);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith({ error: terminal });
  });
});
