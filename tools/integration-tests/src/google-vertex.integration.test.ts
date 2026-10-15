import { createGoogleVertex } from '@ai-sdk/google-vertex/edge';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { generateText, type ModelMessage, streamText } from 'ai';
import { describe, expect, it } from 'vitest';

describe('Google Vertex tool result files', () => {
  const baseURL = 'https://aiplatform.googleapis.com/v1/publishers/google';
  const requestUrl = `${baseURL}/models/*`;
  const server = createTestServer({
    [requestUrl]: {},
  });
  const model = createGoogleVertex({ apiKey: 'test-api-key' })(
    'gemini-3.8-flash',
  );
  const response = {
    candidates: [
      {
        content: { role: 'model', parts: [{ text: 'ok' }] },
        finishReason: 'STOP',
        index: 0,
      },
    ],
  };

  it.each(['generateText', 'streamText'] as const)(
    '%s preserves GCS file references in user messages and tool results',
    async method => {
      server.urls[requestUrl].response =
        method === 'generateText'
          ? { type: 'json-value', body: response }
          : {
              type: 'stream-chunks',
              chunks: [`data: ${JSON.stringify(response)}\n\n`],
            };
      const originalUrl = 'gs://example-bucket/renditions/My Hero.png';
      const file = {
        type: 'file' as const,
        mediaType: 'image/png',
        data: {
          type: 'url' as const,
          url: new URL(originalUrl),
          originalUrl,
        },
      };
      const messages: ModelMessage[] = [
        { role: 'user', content: [file] },
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'call_1',
              toolName: 'view_files',
              input: {},
              providerOptions: {
                googleVertex: { thoughtSignature: 'test-signature' },
              },
            },
          ],
        },
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'call_1',
              toolName: 'view_files',
              output: {
                type: 'content',
                value: [{ type: 'text', text: 'hero.png activated' }, file],
              },
            },
          ],
        },
      ];

      const result =
        method === 'generateText'
          ? await generateText({ model, messages })
          : streamText({ model, messages });

      expect(await result.text).toBe('ok');
      expect(server.calls).toHaveLength(1);
      const { contents } = await server.calls[0].requestBodyJson;
      const fileData = { mimeType: 'image/png', fileUri: originalUrl };
      expect(contents[0].parts).toEqual([{ fileData }]);
      expect(contents[2].parts).toEqual([
        {
          functionResponse: {
            name: 'view_files',
            response: { name: 'view_files', content: 'hero.png activated' },
            parts: [{ fileData }],
          },
        },
      ]);
    },
  );
});
