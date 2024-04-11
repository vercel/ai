import assert from 'node:assert';
import { z } from 'zod';
import { convertArrayToReadableStream } from '../test/convert-array-to-readable-stream';
import { convertAsyncIterableToArray } from '../test/convert-async-iterable-to-array';
import { convertReadableStreamToArray } from '../test/convert-readable-stream-to-array';
import { MockLanguageModelV1 } from '../test/mock-language-model-v1';
import { experimental_streamText } from './stream-text';

describe('result.textStream', () => {
  it('should send text deltas', async () => {
    const result = await experimental_streamText({
      model: new MockLanguageModelV1({
        doStream: async ({ prompt, mode }) => {
          assert.deepStrictEqual(mode, { type: 'regular', tools: undefined });
          assert.deepStrictEqual(prompt, [
            { role: 'user', content: [{ type: 'text', text: 'test-input' }] },
          ]);

          return {
            stream: convertArrayToReadableStream([
              { type: 'text-delta', textDelta: 'Hello' },
              { type: 'text-delta', textDelta: ', ' },
              { type: 'text-delta', textDelta: `world!` },
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
      prompt: 'test-input',
    });

    assert.deepStrictEqual(
      await convertAsyncIterableToArray(result.textStream),
      ['Hello', ', ', 'world!'],
    );
  });
});

describe('result.fullStream', () => {
  it('should send text deltas', async () => {
    const result = await experimental_streamText({
      model: new MockLanguageModelV1({
        doStream: async ({ prompt, mode }) => {
          assert.deepStrictEqual(mode, { type: 'regular', tools: undefined });
          assert.deepStrictEqual(prompt, [
            { role: 'user', content: [{ type: 'text', text: 'test-input' }] },
          ]);

          return {
            stream: convertArrayToReadableStream([
              { type: 'text-delta', textDelta: 'Hello' },
              { type: 'text-delta', textDelta: ', ' },
              { type: 'text-delta', textDelta: `world!` },
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
      prompt: 'test-input',
    });

    assert.deepStrictEqual(
      await convertAsyncIterableToArray(result.fullStream),
      [
        { type: 'text-delta', textDelta: 'Hello' },
        { type: 'text-delta', textDelta: ', ' },
        { type: 'text-delta', textDelta: 'world!' },
        {
          type: 'finish',
          finishReason: 'stop',
          usage: { completionTokens: 10, promptTokens: 3, totalTokens: 13 },
        },
      ],
    );
  });

  it('should send tool calls', async () => {
    const result = await experimental_streamText({
      model: new MockLanguageModelV1({
        doStream: async ({ prompt, mode }) => {
          assert.deepStrictEqual(mode, {
            type: 'regular',
            tools: [
              {
                type: 'function',
                name: 'tool1',
                description: undefined,
                parameters: {
                  $schema: 'http://json-schema.org/draft-07/schema#',
                  additionalProperties: false,
                  properties: { value: { type: 'string' } },
                  required: ['value'],
                  type: 'object',
                },
              },
            ],
          });
          assert.deepStrictEqual(prompt, [
            { role: 'user', content: [{ type: 'text', text: 'test-input' }] },
          ]);

          return {
            stream: convertArrayToReadableStream([
              {
                type: 'tool-call',
                toolCallType: 'function',
                toolCallId: 'call-1',
                toolName: 'tool1',
                args: `{ "value": "value" }`,
              },
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
      tools: {
        tool1: {
          parameters: z.object({ value: z.string() }),
        },
      },
      prompt: 'test-input',
    });

    assert.deepStrictEqual(
      await convertAsyncIterableToArray(result.fullStream),
      [
        {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'tool1',
          args: { value: 'value' },
        },
        {
          type: 'finish',
          finishReason: 'stop',
          usage: { completionTokens: 10, promptTokens: 3, totalTokens: 13 },
        },
      ],
    );
  });

  it('should send tool results', async () => {
    const result = await experimental_streamText({
      model: new MockLanguageModelV1({
        doStream: async ({ prompt, mode }) => {
          assert.deepStrictEqual(mode, {
            type: 'regular',
            tools: [
              {
                type: 'function',
                name: 'tool1',
                description: undefined,
                parameters: {
                  $schema: 'http://json-schema.org/draft-07/schema#',
                  additionalProperties: false,
                  properties: { value: { type: 'string' } },
                  required: ['value'],
                  type: 'object',
                },
              },
            ],
          });
          assert.deepStrictEqual(prompt, [
            { role: 'user', content: [{ type: 'text', text: 'test-input' }] },
          ]);

          return {
            stream: convertArrayToReadableStream([
              {
                type: 'tool-call',
                toolCallType: 'function',
                toolCallId: 'call-1',
                toolName: 'tool1',
                args: `{ "value": "value" }`,
              },
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
      tools: {
        tool1: {
          parameters: z.object({ value: z.string() }),
          execute: async ({ value }) => `${value}-result`,
        },
      },
      prompt: 'test-input',
    });

    assert.deepStrictEqual(
      await convertAsyncIterableToArray(result.fullStream),
      [
        {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'tool1',
          args: { value: 'value' },
        },
        {
          type: 'tool-result',
          toolCallId: 'call-1',
          toolName: 'tool1',
          args: { value: 'value' },
          result: 'value-result',
        },
        {
          type: 'finish',
          finishReason: 'stop',
          usage: { completionTokens: 10, promptTokens: 3, totalTokens: 13 },
        },
      ],
    );
  });
});

describe('result.toAIStream', () => {
  it('should transform textStream through callbacks and data transformers', async () => {
    const result = await experimental_streamText({
      model: new MockLanguageModelV1({
        doStream: async ({ prompt, mode }) => {
          return {
            stream: convertArrayToReadableStream([
              { type: 'text-delta', textDelta: 'Hello' },
              { type: 'text-delta', textDelta: ', ' },
              { type: 'text-delta', textDelta: 'world!' },
            ]),
            rawCall: { rawPrompt: 'prompt', rawSettings: {} },
          };
        },
      }),
      prompt: 'test-input',
    });

    assert.deepStrictEqual(
      await convertReadableStreamToArray(
        result.toAIStream().pipeThrough(new TextDecoderStream()),
      ),
      ['0:"Hello"\n', '0:", "\n', '0:"world!"\n'],
    );
  });
});

describe('result.toTextStreamResponse', () => {
  it('should create a Response with a text stream', async () => {
    const result = await experimental_streamText({
      model: new MockLanguageModelV1({
        doStream: async ({ prompt, mode }) => {
          return {
            stream: convertArrayToReadableStream([
              { type: 'text-delta', textDelta: 'Hello' },
              { type: 'text-delta', textDelta: ', ' },
              { type: 'text-delta', textDelta: 'world!' },
            ]),
            rawCall: { rawPrompt: 'prompt', rawSettings: {} },
          };
        },
      }),
      prompt: 'test-input',
    });

    const response = result.toTextStreamResponse();

    assert.strictEqual(response.status, 200);
    assert.strictEqual(
      response.headers.get('Content-Type'),
      'text/plain; charset=utf-8',
    );

    // Read the chunks into an array
    const reader = response.body!.getReader();
    const chunks = [];
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(new TextDecoder().decode(value));
    }

    assert.deepStrictEqual(chunks, ['Hello', ', ', 'world!']);
  });
});
