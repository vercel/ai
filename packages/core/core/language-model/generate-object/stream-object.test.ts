import assert from 'node:assert';
import { z } from 'zod';
import { convertArrayToReadableStream } from '../test/convert-array-to-readable-stream';
import { convertAsyncIterableToArray } from '../test/convert-async-iterable-to-array';
import { MockLanguageModel } from '../test/mock-language-model';
import { streamObject } from './stream-object';

describe('result.objectStream', () => {
  it('should send object deltas with json mode', async () => {
    const result = await streamObject({
      model: new MockLanguageModel({
        objectMode: 'json',
        doStreamJsonText: async ({ prompt, mode }) => {
          assert.deepStrictEqual(mode, { type: 'json' });
          assert.deepStrictEqual(prompt, {
            system:
              'JSON schema:\n' +
              '{"type":"object","properties":{"content":{"type":"string"}},"required":["content"],"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}\n' +
              'You MUST answer with a JSON object that matches the JSON schema above.',
            messages: [{ role: 'user', content: 'prompt' }],
          });

          return convertArrayToReadableStream([
            { type: 'json-text-delta', textDelta: '{ ' },
            { type: 'json-text-delta', textDelta: '"content": ' },
            { type: 'json-text-delta', textDelta: `"Hello, ` },
            { type: 'json-text-delta', textDelta: `world` },
            { type: 'json-text-delta', textDelta: `!"` },
            { type: 'json-text-delta', textDelta: ' }' },
          ]);
        },
      }),
      schema: z.object({ content: z.string() }),
      prompt: 'prompt',
    });

    assert.deepStrictEqual(
      await convertAsyncIterableToArray(result.objectStream),
      [
        {},
        { content: 'Hello, ' },
        { content: 'Hello, world' },
        { content: 'Hello, world!' },
      ],
    );
  });

  it('should send object deltas with tool mode', async () => {
    const result = await streamObject({
      model: new MockLanguageModel({
        objectMode: 'tool',
        doStreamJsonText: async ({ prompt, mode }) => {
          assert.deepStrictEqual(mode, {
            type: 'tool',
            tool: {
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
          assert.deepStrictEqual(prompt, {
            messages: [{ role: 'user', content: 'prompt' }],
          });

          return convertArrayToReadableStream([
            { type: 'json-text-delta', textDelta: '{ ' },
            { type: 'json-text-delta', textDelta: '"content": ' },
            { type: 'json-text-delta', textDelta: `"Hello, ` },
            { type: 'json-text-delta', textDelta: `world` },
            { type: 'json-text-delta', textDelta: `!"` },
            { type: 'json-text-delta', textDelta: ' }' },
          ]);
        },
      }),
      schema: z.object({ content: z.string() }),
      prompt: 'prompt',
    });

    assert.deepStrictEqual(
      await convertAsyncIterableToArray(result.objectStream),
      [
        {},
        { content: 'Hello, ' },
        { content: 'Hello, world' },
        { content: 'Hello, world!' },
      ],
    );
  });
});
