import { MockLanguageModelV4, convertArrayToReadableStream } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { z } from 'zod/v4';
import { Output, WorkflowAgent } from './workflow-agent.js';

describe('WorkflowAgent.stream structured output', () => {
  it('forwards the response format and parses the structured result', async () => {
    const model = new MockLanguageModelV4({
      doStream: async options => ({
        stream: convertArrayToReadableStream([
          { type: 'stream-start' as const, warnings: [] },
          { type: 'text-start' as const, id: '1' },
          {
            type: 'text-delta' as const,
            id: '1',
            delta:
              options.responseFormat?.type === 'json'
                ? '{"ok":true}'
                : 'The operation completed successfully.',
          },
          { type: 'text-end' as const, id: '1' },
          {
            type: 'finish' as const,
            finishReason: { unified: 'stop' as const, raw: 'stop' },
            usage: {
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
            },
            providerMetadata: {},
          },
        ]),
      }),
    });

    const agent = new WorkflowAgent({
      model,
      output: Output.object({
        schema: z.object({ ok: z.boolean() }),
      }),
    });

    const result = await agent.stream({
      messages: [{ role: 'user', content: 'Return the structured result.' }],
      writable: new WritableStream(),
    });

    expect(result.output).toEqual({ ok: true });
    expect(model.doStreamCalls[0]?.responseFormat).toMatchObject({
      type: 'json',
      schema: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
        },
        required: ['ok'],
      },
    });
  });
});
