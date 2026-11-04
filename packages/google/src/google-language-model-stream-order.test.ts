import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { describe, expect, it } from 'vitest';
import { GoogleLanguageModel } from './google-language-model';

const url =
  'https://example.test/models/gemini-pro:streamGenerateContent?alt=sse';
const server = createTestServer({ [url]: {} });

describe.each(['google.generative-ai', 'google.vertex.chat'])(
  '%s streamed function call ordering',
  provider => {
    it.each(
      [false, true].flatMap(thought =>
        [false, true].flatMap(noArgs =>
          [false, true].map(separateChunks => ({
            thought,
            noArgs,
            separateChunks,
          })),
        ),
      ),
    )(
      'preserves ordered blocks: %j',
      async ({ thought, noArgs, separateChunks }) => {
        const parts = [
          { text: 'A', thought },
          {
            functionCall: {
              id: 'call-1',
              name: 'lookup',
              ...(noArgs ? {} : { args: { query: 'example' } }),
            },
            thoughtSignature: 'signature',
          },
          { text: 'B', thought },
        ];
        const chunks = separateChunks ? parts.map(part => [part]) : [parts];
        server.urls[url].response = {
          type: 'stream-chunks',
          chunks: chunks.map(
            (parts, index) =>
              `data: ${JSON.stringify({
                candidates: [
                  {
                    content: { role: 'model', parts },
                    ...(index === chunks.length - 1
                      ? { finishReason: 'STOP' }
                      : {}),
                  },
                ],
              })}\n\n`,
          ),
        };
        const model = new GoogleLanguageModel('gemini-pro', {
          provider,
          baseURL: 'https://example.test',
          headers: {},
          generateId: () => 'generated-id',
        });
        const { stream } = await model.doStream({
          prompt: [
            { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
          ],
        });
        const events = await convertReadableStreamToArray(stream);
        const block = thought ? 'reasoning' : 'text';
        expect(events.map(event => event.type)).toEqual([
          'stream-start',
          `${block}-start`,
          `${block}-delta`,
          `${block}-end`,
          'tool-input-start',
          ...(noArgs ? [] : ['tool-input-delta']),
          'tool-input-end',
          'tool-call',
          `${block}-start`,
          `${block}-delta`,
          `${block}-end`,
          'finish',
        ]);
        expect(
          events
            .filter(
              event =>
                event.type === 'text-start' || event.type === 'reasoning-start',
            )
            .map(event => event.id),
        ).toEqual(['0', '1']);
        const metadataKey =
          provider === 'google.vertex.chat' ? 'vertex' : 'google';
        expect(events.find(event => event.type === 'tool-call')).toMatchObject({
          toolCallId: 'call-1',
          toolName: 'lookup',
          input: noArgs ? '{}' : '{"query":"example"}',
          providerMetadata: {
            [metadataKey]: { thoughtSignature: 'signature' },
          },
        });
      },
    );
  },
);
