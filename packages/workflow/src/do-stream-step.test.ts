import type {
  LanguageModelV4CallOptions,
  LanguageModelV4Prompt,
} from '@ai-sdk/provider';
import { MockLanguageModelV4, convertArrayToReadableStream } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { doStreamStep } from './do-stream-step.js';

describe('doStreamStep', () => {
  it('forwards responseFormat to the model call', async () => {
    const responseFormat: LanguageModelV4CallOptions['responseFormat'] = {
      type: 'json',
      schema: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
        },
        required: ['ok'],
        additionalProperties: false,
      },
    };

    const model = new MockLanguageModelV4({
      doStream: async () => ({
        stream: convertArrayToReadableStream([
          { type: 'stream-start', warnings: [] },
          { type: 'text-start', id: '1' },
          { type: 'text-delta', id: '1', delta: '{"ok":true}' },
          { type: 'text-end', id: '1' },
          {
            type: 'finish',
            finishReason: { unified: 'stop', raw: 'stop' },
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
          },
        ]),
      }),
    });

    const prompt: LanguageModelV4Prompt = [
      {
        role: 'user',
        content: [{ type: 'text', text: 'return json' }],
      },
    ];

    await doStreamStep(prompt, model, undefined, undefined, {
      responseFormat,
    });

    expect(model.doStreamCalls[0].responseFormat).toStrictEqual(responseFormat);
  });
});
