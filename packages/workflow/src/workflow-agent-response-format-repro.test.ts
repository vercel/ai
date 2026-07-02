import { MockLanguageModelV4, convertArrayToReadableStream } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Output, WorkflowAgent } from './workflow-agent.js';

describe('WorkflowAgent.stream structured output responseFormat forwarding', () => {
  it('forwards Output.object responseFormat to the model stream call', async () => {
    const model = new MockLanguageModelV4({
      doStream: async () => ({
        stream: convertArrayToReadableStream([
          { type: 'stream-start' as const, warnings: [] },
          { type: 'text-start' as const, id: '1' },
          { type: 'text-delta' as const, id: '1', delta: '{"ok":true}' },
          { type: 'text-end' as const, id: '1' },
          {
            type: 'finish' as const,
            finishReason: { unified: 'stop' as const, raw: 'stop' },
            usage: {
              inputTokens: {
                total: 0,
                noCache: 0,
                cacheRead: undefined,
                cacheWrite: undefined,
              },
              outputTokens: {
                total: 0,
                text: 0,
                reasoning: undefined,
              },
              totalTokens: 0,
            },
          },
        ]),
      }),
    });

    const agent = new WorkflowAgent({
      model,
      output: Output.object({ schema: z.object({ ok: z.boolean() }) }),
    });

    await agent.stream({
      messages: [{ role: 'user', content: 'go' }],
      writable: new WritableStream(),
    });

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
