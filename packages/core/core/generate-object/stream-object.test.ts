import { TypeValidationError } from '@ai-sdk/provider';
import {
  convertArrayToReadableStream,
  convertAsyncIterableToArray,
  convertReadableStreamToArray,
} from '@ai-sdk/provider-utils/test';
import assert from 'node:assert';
import { z } from 'zod';
import { MockLanguageModelV1 } from '../test/mock-language-model-v1';
import { streamObject } from './stream-object';
import { createMockServerResponse } from '../test/mock-server-response';

describe('result.objectStream', () => {
  it('should send object deltas with json mode', async () => {
    const result = await streamObject({
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
    const result = await streamObject({
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

describe('result.fullStream', () => {
  it('should send full stream data', async () => {
    const result = await streamObject({
      model: new MockLanguageModelV1({
        doStream: async ({ prompt, mode }) => {
          return {
            stream: convertArrayToReadableStream([
              { type: 'text-delta', textDelta: '{ ' },
              { type: 'text-delta', textDelta: '"content": ' },
              { type: 'text-delta', textDelta: `"Hello, ` },
              { type: 'text-delta', textDelta: `world` },
              { type: 'text-delta', textDelta: `!"` },
              { type: 'text-delta', textDelta: ' }' },
              {
                type: 'finish',
                finishReason: 'stop',
                usage: { completionTokens: 10, promptTokens: 2 },
                logprobs: [{ token: '-', logprob: 1, topLogprobs: [] }],
              },
            ]),
            rawCall: { rawPrompt: 'prompt', rawSettings: { logprobs: 0 } },
          };
        },
      }),
      schema: z.object({ content: z.string() }),
      mode: 'json',
      prompt: 'prompt',
    });

    assert.deepStrictEqual(
      await convertAsyncIterableToArray(result.fullStream),
      [
        {
          type: 'object',
          object: {},
        },
        {
          type: 'text-delta',
          textDelta: '{ ',
        },
        {
          type: 'object',
          object: { content: 'Hello, ' },
        },
        {
          type: 'text-delta',
          textDelta: '"content": "Hello, ',
        },
        {
          type: 'object',
          object: { content: 'Hello, world' },
        },
        {
          type: 'text-delta',
          textDelta: 'world',
        },
        {
          type: 'object',
          object: { content: 'Hello, world!' },
        },
        {
          type: 'text-delta',
          textDelta: '!"',
        },
        {
          type: 'text-delta',
          textDelta: ' }',
        },
        {
          type: 'finish',
          finishReason: 'stop',
          usage: { promptTokens: 2, completionTokens: 10, totalTokens: 12 },
          logprobs: [
            {
              token: '-',
              logprob: 1,
              topLogprobs: [],
            },
          ],
        },
      ],
    );
  });
});

describe('result.textStream', () => {
  it('should send text stream', async () => {
    const result = await streamObject({
      model: new MockLanguageModelV1({
        doStream: async ({ prompt, mode }) => {
          return {
            stream: convertArrayToReadableStream([
              { type: 'text-delta', textDelta: '{ ' },
              { type: 'text-delta', textDelta: '"content": ' },
              { type: 'text-delta', textDelta: `"Hello, ` },
              { type: 'text-delta', textDelta: `world` },
              { type: 'text-delta', textDelta: `!"` },
              { type: 'text-delta', textDelta: ' }' },
              {
                type: 'finish',
                finishReason: 'stop',
                usage: { completionTokens: 10, promptTokens: 2 },
              },
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
      await convertAsyncIterableToArray(result.textStream),
      ['{ ', '"content": "Hello, ', 'world', '!"', ' }'],
    );
  });
});

describe('result.toTextStreamResponse', () => {
  it('should create a Response with a text stream', async () => {
    const result = await streamObject({
      model: new MockLanguageModelV1({
        doStream: async ({ prompt, mode }) => {
          return {
            stream: convertArrayToReadableStream([
              { type: 'text-delta', textDelta: '{ ' },
              { type: 'text-delta', textDelta: '"content": ' },
              { type: 'text-delta', textDelta: `"Hello, ` },
              { type: 'text-delta', textDelta: `world` },
              { type: 'text-delta', textDelta: `!"` },
              { type: 'text-delta', textDelta: ' }' },
              {
                type: 'finish',
                finishReason: 'stop',
                usage: { completionTokens: 10, promptTokens: 2 },
              },
            ]),
            rawCall: { rawPrompt: 'prompt', rawSettings: {} },
          };
        },
      }),
      schema: z.object({ content: z.string() }),
      mode: 'json',
      prompt: 'prompt',
    });

    const response = result.toTextStreamResponse();

    assert.strictEqual(response.status, 200);
    assert.strictEqual(
      response.headers.get('Content-Type'),
      'text/plain; charset=utf-8',
    );

    assert.deepStrictEqual(
      await convertReadableStreamToArray(
        response.body!.pipeThrough(new TextDecoderStream()),
      ),
      ['{ ', '"content": "Hello, ', 'world', '!"', ' }'],
    );
  });
});

describe('result.pipeTextStreamToResponse', async () => {
  it('should write text deltas to a Node.js response-like object', async () => {
    const mockResponse = createMockServerResponse();

    const result = await streamObject({
      model: new MockLanguageModelV1({
        doStream: async ({ prompt, mode }) => {
          return {
            stream: convertArrayToReadableStream([
              { type: 'text-delta', textDelta: '{ ' },
              { type: 'text-delta', textDelta: '"content": ' },
              { type: 'text-delta', textDelta: `"Hello, ` },
              { type: 'text-delta', textDelta: `world` },
              { type: 'text-delta', textDelta: `!"` },
              { type: 'text-delta', textDelta: ' }' },
              {
                type: 'finish',
                finishReason: 'stop',
                usage: { completionTokens: 10, promptTokens: 2 },
              },
            ]),
            rawCall: { rawPrompt: 'prompt', rawSettings: {} },
          };
        },
      }),
      schema: z.object({ content: z.string() }),
      mode: 'json',
      prompt: 'prompt',
    });

    result.pipeTextStreamToResponse(mockResponse);

    // Wait for the stream to finish writing to the mock response
    await new Promise(resolve => {
      const checkIfEnded = () => {
        if (mockResponse.ended) {
          resolve(undefined);
        } else {
          setImmediate(checkIfEnded);
        }
      };
      checkIfEnded();
    });

    const decoder = new TextDecoder();

    assert.strictEqual(mockResponse.statusCode, 200);
    assert.deepStrictEqual(mockResponse.headers, {
      'Content-Type': 'text/plain; charset=utf-8',
    });
    assert.deepStrictEqual(
      mockResponse.writtenChunks.map(chunk => decoder.decode(chunk)),
      ['{ ', '"content": "Hello, ', 'world', '!"', ' }'],
    );
  });
});

describe('result.usage', () => {
  it('should resolve with token usage', async () => {
    const result = await streamObject({
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
              {
                type: 'finish',
                finishReason: 'stop',
                usage: { completionTokens: 10, promptTokens: 3 },
              },
            ]),
            rawCall: { rawPrompt: 'prompt', rawSettings: {} },
          };
        },
      }),
      schema: z.object({ content: z.string() }),
      mode: 'json',
      prompt: 'prompt',
    });

    // consume stream (runs in parallel)
    convertAsyncIterableToArray(result.partialObjectStream);

    assert.deepStrictEqual(await result.usage, {
      completionTokens: 10,
      promptTokens: 3,
      totalTokens: 13,
    });
  });
});

describe('result.object', () => {
  it('should resolve with typed object', async () => {
    const result = await streamObject({
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
              {
                type: 'finish',
                finishReason: 'stop',
                usage: { completionTokens: 10, promptTokens: 3 },
              },
            ]),
            rawCall: { rawPrompt: 'prompt', rawSettings: {} },
          };
        },
      }),
      schema: z.object({ content: z.string() }),
      mode: 'json',
      prompt: 'prompt',
    });

    // consume stream (runs in parallel)
    convertAsyncIterableToArray(result.partialObjectStream);

    assert.deepStrictEqual(await result.object, {
      content: 'Hello, world!',
    });
  });

  it('should reject object promise when the streamed object does not match the schema', async () => {
    const result = await streamObject({
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
              { type: 'text-delta', textDelta: '"invalid": ' },
              { type: 'text-delta', textDelta: `"Hello, ` },
              { type: 'text-delta', textDelta: `world` },
              { type: 'text-delta', textDelta: `!"` },
              { type: 'text-delta', textDelta: ' }' },
              {
                type: 'finish',
                finishReason: 'stop',
                usage: { completionTokens: 10, promptTokens: 3 },
              },
            ]),
            rawCall: { rawPrompt: 'prompt', rawSettings: {} },
          };
        },
      }),
      schema: z.object({ content: z.string() }),
      mode: 'json',
      prompt: 'prompt',
    });

    // consume stream (runs in parallel)
    convertAsyncIterableToArray(result.partialObjectStream);

    await result.object
      .then(() => {
        assert.fail('Expected object promise to be rejected');
      })
      .catch(error => {
        expect(TypeValidationError.isTypeValidationError(error)).toBeTruthy();
      });
  });
});

describe('onFinish callback', () => {
  describe('with successfully validated object', () => {
    let result: Parameters<
      Required<Parameters<typeof streamObject>[0]>['onFinish']
    >[0];

    beforeEach(async () => {
      const { partialObjectStream } = await streamObject({
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
                {
                  type: 'finish',
                  finishReason: 'stop',
                  usage: { completionTokens: 10, promptTokens: 3 },
                },
              ]),
              rawCall: { rawPrompt: 'prompt', rawSettings: {} },
            };
          },
        }),
        schema: z.object({ content: z.string() }),
        mode: 'json',
        prompt: 'prompt',
        onFinish: async event => {
          result = event as unknown as typeof result;
        },
      });

      // consume stream
      await convertAsyncIterableToArray(partialObjectStream);
    });

    it('should contain token usage', async () => {
      assert.deepStrictEqual(result.usage, {
        completionTokens: 10,
        promptTokens: 3,
        totalTokens: 13,
      });
    });

    it('should contain the full object', async () => {
      assert.deepStrictEqual(result.object, {
        content: 'Hello, world!',
      });
    });

    it('should not contain an error object', async () => {
      assert.deepStrictEqual(result.error, undefined);
    });
  });

  describe("with object that doesn't match the schema", () => {
    let result: Parameters<
      Required<Parameters<typeof streamObject>[0]>['onFinish']
    >[0];

    beforeEach(async () => {
      const { partialObjectStream, object } = await streamObject({
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
                { type: 'text-delta', textDelta: '"invalid": ' },
                { type: 'text-delta', textDelta: `"Hello, ` },
                { type: 'text-delta', textDelta: `world` },
                { type: 'text-delta', textDelta: `!"` },
                { type: 'text-delta', textDelta: ' }' },
                {
                  type: 'finish',
                  finishReason: 'stop',
                  usage: { completionTokens: 10, promptTokens: 3 },
                },
              ]),
              rawCall: { rawPrompt: 'prompt', rawSettings: {} },
            };
          },
        }),
        schema: z.object({ content: z.string() }),
        mode: 'json',
        prompt: 'prompt',
        onFinish: async event => {
          result = event as unknown as typeof result;
        },
      });

      // consume stream
      await convertAsyncIterableToArray(partialObjectStream);

      // consume expected error rejection
      await object.catch(() => {});
    });

    it('should contain token usage', async () => {
      assert.deepStrictEqual(result.usage, {
        completionTokens: 10,
        promptTokens: 3,
        totalTokens: 13,
      });
    });

    it('should not contain a full object', async () => {
      assert.deepStrictEqual(result.object, undefined);
    });

    it('should contain an error object', async () => {
      assert.deepStrictEqual(
        TypeValidationError.isTypeValidationError(result.error),
        true,
      );
    });
  });
});
