import { MockLanguageModelV4, convertArrayToReadableStream } from 'ai/test';
import { describe, expect, it, vi } from 'vitest';
import { WorkflowAgent } from './workflow-agent.js';

async function runAgentWithStreamError(
  terminal: unknown,
  onError?: (event: { error: unknown }) => void | Promise<void>,
) {
  const streamedParts: unknown[] = [];
  const model = new MockLanguageModelV4({
    doStream: async () => ({
      stream: convertArrayToReadableStream([
        { type: 'stream-start' as const, warnings: [] },
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
    });
  } catch (error) {
    didReject = true;
    rejection = error;
  }

  return { didReject, rejection, streamResult, streamedParts };
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
