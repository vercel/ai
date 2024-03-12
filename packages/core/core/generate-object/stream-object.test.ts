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
            warnings: [],
          };
        },
      }),
      schema: z.object({ content: z.string() }),
      mode: 'json',
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
                toolCallId: 'tool-call-1',
                toolName: 'json',
                argsTextDelta: '{ ',
              },
              {
                type: 'tool-call-delta',
                toolCallId: 'tool-call-1',
                toolName: 'json',
                argsTextDelta: '"content": ',
              },
              {
                type: 'tool-call-delta',
                toolCallId: 'tool-call-1',
                toolName: 'json',
                argsTextDelta: `"Hello, `,
              },
              {
                type: 'tool-call-delta',
                toolCallId: 'tool-call-1',
                toolName: 'json',
                argsTextDelta: `world`,
              },
              {
                type: 'tool-call-delta',
                toolCallId: 'tool-call-1',
                toolName: 'json',
                argsTextDelta: `!"`,
              },
              {
                type: 'tool-call-delta',
                toolCallId: 'tool-call-1',
                toolName: 'json',
                argsTextDelta: ' }',
              },
            ]),
            warnings: [],
          };
        },
      }),
      schema: z.object({ content: z.string() }),
      mode: 'tool',
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
