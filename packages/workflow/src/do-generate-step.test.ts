import { APICallError } from '@ai-sdk/provider';
import { tool } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod/v4';
import { doGenerateStep } from './do-generate-step.js';
import { serializeToolSet } from './serializable-schema.js';

const prompt = [
  { role: 'user' as const, content: [{ type: 'text' as const, text: 'test' }] },
];
const usage = {
  inputTokens: {
    total: 3,
    noCache: undefined,
    cacheRead: 3,
    cacheWrite: undefined,
  },
  outputTokens: { total: 2, text: undefined, reasoning: 2 },
};
const success = {
  content: [{ type: 'text' as const, text: 'Answer' }],
  usage,
  finishReason: { unified: 'stop' as const, raw: 'stop' },
  warnings: [],
};

describe('doGenerateStep', () => {
  afterEach(() => vi.useRealTimers());

  it('rejects an expired deadline without dispatching the model and disables Workflow retries', async () => {
    const model = new MockLanguageModelV4({ doGenerate: success });
    await expect(
      doGenerateStep(prompt, model, {}, { timeoutAt: Date.now() - 1 }),
    ).resolves.toMatchObject({
      terminalError: expect.objectContaining({ name: 'TimeoutError' }),
    });
    expect(model.doGenerateCalls).toHaveLength(0);
    expect(doGenerateStep.maxRetries).toBe(0);
  });

  it('uses SDK retries for retryable failures', async () => {
    vi.useFakeTimers();
    let calls = 0;
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        if (++calls === 1)
          throw new APICallError({
            message: 'retry',
            url: 'https://example.com',
            requestBodyValues: {},
            statusCode: 503,
          });
        return success;
      },
    });
    const result = doGenerateStep(prompt, model, {}, { maxRetries: 1 });
    const assertion = expect(result).resolves.toMatchObject({
      finish: { finishReason: 'stop' },
    });
    await vi.runAllTimersAsync();
    await assertion;
    expect(model.doGenerateCalls).toHaveLength(2);
  });

  it('checks the absolute deadline again before retry dispatch', async () => {
    // Advance the observed clock inside the failed call to model an attempt
    // that consumed the remaining deadline before retry preparation.
    const now = Date.now();
    const dateNow = vi.spyOn(Date, 'now');
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        dateNow.mockReturnValue(now + 1000);
        throw new APICallError({
          message: 'retry',
          url: 'https://example.com',
          requestBodyValues: {},
          statusCode: 503,
          responseHeaders: { 'retry-after': '0' },
        });
      },
    });
    try {
      await expect(
        doGenerateStep(
          prompt,
          model,
          {},
          { timeoutAt: now + 500, maxRetries: 1 },
        ),
      ).resolves.toMatchObject({ terminalError: expect.anything() });
      expect(model.doGenerateCalls).toHaveLength(1);
    } finally {
      dateNow.mockRestore();
    }
  });

  it('parses repaired inputs inside the step and returns callback replay data', async () => {
    const tools = serializeToolSet({
      lookup: tool({
        inputSchema: z.object({ city: z.string() }),
        onInputStart() {},
        onInputAvailable() {},
      }),
    });
    const repair = vi.fn(async ({ toolCall }) => ({
      ...toolCall,
      input: '{"city":"London"}',
    }));
    const model = new MockLanguageModelV4({
      doGenerate: {
        ...success,
        content: [
          {
            type: 'tool-call',
            toolCallId: 'call',
            toolName: 'lookup',
            input: '{',
          },
        ],
      },
    });
    const result = await doGenerateStep(prompt, model, tools, {
      repairToolCall: repair,
    });
    expect(repair).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      toolCalls: [{ input: { city: 'London' } }],
      toolInputLifecycleEvents: [
        ['start', 'call', 'lookup'],
        ['available', 'call'],
      ],
    });
  });

  it.each(['required', { type: 'tool', toolName: 'lookup' }] as const)(
    'enforces tool choice %s',
    async toolChoice => {
      await expect(
        doGenerateStep(
          prompt,
          new MockLanguageModelV4({ doGenerate: success }),
          {},
          { toolChoice },
        ),
      ).resolves.toMatchObject({
        terminalError: expect.objectContaining({
          name: 'AI_ToolChoiceViolationError',
        }),
      });
    },
  );
});
