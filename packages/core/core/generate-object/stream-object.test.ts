import assert from 'node:assert';
import { z } from 'zod';
import { convertArrayToReadableStream } from '../test/convert-array-to-readable-stream';
import { convertAsyncIterableToArray } from '../test/convert-async-iterable-to-array';
import { MockLanguageModelV1 } from '../test/mock-language-model-v1';
import { experimental_streamObject } from './stream-object';

describe('result.objectStream', () => {
  it('should send object deltas with json mode', async () => {
    const result = await experimental_streamObject({
      model: new MockLanguageModelV1({
        doStream: async ({ prompt, mode }) => {
          assert.deepStrictEqual(mode, { type: 'object-json' });
          assert.deepStrictEqual(prompt, [
            {
              role: 'system',
              content:
                'JSON schema:\n' +
                '{"type":"object","properties":{"content":{"type":"string"}},"required":["content"],"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}\n' +
                'You MUST answer with a JSON object that matches the JSON schema above.',
            },
            { role: 'user', content: [{ type: 'text', text: 'prompt' }] },
          ]);

          return {
            stream: convertArrayToReadableStream([
              { type: 'text-delta', textDelta: '{ ' },
              { type: 'text-delta', textDelta: '"content": ' },
              { type: 'text-delta', textDelta: `"Hello, ` },
              { type: 'text-delta', textDelta: `world` },
              { type: 'text-delta', textDelta: `!"` },
              { type: 'text-delta', textDelta: ' }' },
            ]),
            rawCall: { rawPrompt: 'prompt', rawSettings: {} },
          };
        },
      }),
      schema: z.object({ content: z.string() }),
      mode: 'json',
      prompt: 'prompt',
    });

    assert.deepStrictEqual(
      await convertAsyncIterableToArray(result.partialObjectStream),
      [
        {},
        { content: 'Hello, ' },
        { content: 'Hello, world' },
        { content: 'Hello, world!' },
      ],
    );
  });

  it('should send object deltas with tool mode', async () => {
    const result = await experimental_streamObject({
      model: new MockLanguageModelV1({
        doStream: async ({ prompt, mode }) => {
          assert.deepStrictEqual(mode, {
            type: 'object-tool',
            tool: {
              type: 'function',
              name: 'json',
              description: 'Respond with a JSON object.',
              parameters: {
                $schema: 'http://json-schema.org/draft-07/schema#',
                additionalProperties: false,
                properties: { content: { type: 'string' } },
                required: ['content'],
                type: 'object',
              },
            },
          });
          assert.deepStrictEqual(prompt, [
            { role: 'user', content: [{ type: 'text', text: 'prompt' }] },
          ]);

          return {
            stream: convertArrayToReadableStream([
              {
                type: 'tool-call-delta',
                toolCallType: 'function',
                toolCallId: 'tool-call-1',
                toolName: 'json',
                argsTextDelta: '{ ',
              },
              {
                type: 'tool-call-delta',
                toolCallType: 'function',
                toolCallId: 'tool-call-1',
                toolName: 'json',
                argsTextDelta: '"content": ',
              },
              {
                type: 'tool-call-delta',
                toolCallType: 'function',
                toolCallId: 'tool-call-1',
                toolName: 'json',
                argsTextDelta: `"Hello, `,
              },
              {
                type: 'tool-call-delta',
                toolCallType: 'function',
                toolCallId: 'tool-call-1',
                toolName: 'json',
                argsTextDelta: `world`,
              },
              {
                type: 'tool-call-delta',
                toolCallType: 'function',
                toolCallId: 'tool-call-1',
                toolName: 'json',
                argsTextDelta: `!"`,
              },
              {
                type: 'tool-call-delta',
                toolCallType: 'function',
                toolCallId: 'tool-call-1',
                toolName: 'json',
                argsTextDelta: ' }',
              },
            ]),
            rawCall: { rawPrompt: 'prompt', rawSettings: {} },
          };
        },
      }),
      schema: z.object({ content: z.string() }),
      mode: 'tool',
      prompt: 'prompt',
    });

    assert.deepStrictEqual(
      await convertAsyncIterableToArray(result.partialObjectStream),
      [
        {},
        { content: 'Hello, ' },
        { content: 'Hello, world' },
        { content: 'Hello, world!' },
      ],
    );
  });
});
