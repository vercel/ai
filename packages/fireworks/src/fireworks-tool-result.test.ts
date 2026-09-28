import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { describe, expect, it } from 'vitest';
import { createFireworks } from './fireworks-provider';

const server = createTestServer({
  'https://api.fireworks.ai/inference/v1/chat/completions': {},
});

describe('multipart tool results', () => {
  it.each(['doGenerate', 'doStream'] as const)(
    'sends image content through %s',
    async method => {
      server.urls[
        'https://api.fireworks.ai/inference/v1/chat/completions'
      ].response =
        method === 'doGenerate'
          ? {
              type: 'json-value',
              body: {
                choices: [
                  {
                    message: { role: 'assistant', content: 'ok' },
                    finish_reason: 'stop',
                    index: 0,
                  },
                ],
              },
            }
          : { type: 'stream-chunks', chunks: ['data: [DONE]\n\n'] };
      const model = createFireworks({ apiKey: 'test-key' })('test-model');
      const result = await model[method]({
        prompt: [
          {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call-image',
                toolName: 'getImage',
                output: {
                  type: 'content',
                  value: [
                    {
                      type: 'file',
                      mediaType: 'image/png',
                      data: { type: 'data', data: 'AAECAw==' },
                    },
                  ],
                },
              },
            ],
          },
        ],
      });
      if ('stream' in result) await convertReadableStreamToArray(result.stream);
      expect((await server.calls[0].requestBodyJson).messages).toEqual([
        {
          role: 'tool',
          tool_call_id: 'call-image',
          content: [
            {
              type: 'image_url',
              image_url: { url: 'data:image/png;base64,AAECAw==' },
            },
          ],
        },
      ]);
    },
  );
});
