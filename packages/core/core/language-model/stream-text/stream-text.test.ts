import assert from 'node:assert';
import { z } from 'zod';
import { convertArrayToReadableStream } from '../test/convert-array-to-readable-stream';
import { convertAsyncIterableToArray } from '../test/convert-async-iterable-to-array';
import { MockLanguageModel } from '../test/mock-language-model';
import { streamText } from './stream-text';
import { createTool } from '../tool';

describe('result.textStream', () => {
  it('should send text deltas', async () => {
    const result = await streamText({
      model: new MockLanguageModel({
        doStream: async ({ prompt }) =>
          convertArrayToReadableStream([
            { type: 'text-delta', textDelta: 'Hello' },
            { type: 'text-delta', textDelta: ', ' },
            { type: 'text-delta', textDelta: `${prompt}!` },
          ]),
      }),
      prompt: 'world',
    });

    assert.deepStrictEqual(
      await convertAsyncIterableToArray(result.textStream),
      ['Hello', ', ', 'world!'],
    );
  });
});

describe('result.fullStream', () => {
  it('should send text deltas', async () => {
    const result = await streamText({
      model: new MockLanguageModel({
        doStream: async ({ prompt }) =>
          convertArrayToReadableStream([
            { type: 'text-delta', textDelta: 'Hello' },
            { type: 'text-delta', textDelta: ', ' },
            { type: 'text-delta', textDelta: `${prompt}!` },
          ]),
      }),
      prompt: 'world',
    });

    assert.deepStrictEqual(
      await convertAsyncIterableToArray(result.fullStream),
      [
        { type: 'text-delta', textDelta: 'Hello' },
        { type: 'text-delta', textDelta: ', ' },
        { type: 'text-delta', textDelta: 'world!' },
      ],
    );
  });

  it('should send tool calls', async () => {
    const result = await streamText({
      model: new MockLanguageModel({
        doStream: async ({ prompt }) =>
          convertArrayToReadableStream([
            {
              type: 'tool-call',
              toolCallId: 'call-1',
              toolName: 'tool-1',
              args: { value: prompt },
            },
          ]),
      }),
      tools: [
        {
          name: 'tool-1',
          parameters: z.object({ value: z.string() }),
        },
      ],
      prompt: 'test-input',
    });

    assert.deepStrictEqual(
      await convertAsyncIterableToArray(result.fullStream),
      [
        {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'tool-1',
          args: { value: 'test-input' },
        },
      ],
    );
  });

  it('should send tool results', async () => {
    const result = await streamText({
      model: new MockLanguageModel({
        doStream: async ({ prompt }) =>
          convertArrayToReadableStream([
            {
              type: 'tool-call',
              toolCallId: 'call-1',
              toolName: 'tool-1',
              args: { value: prompt },
            },
          ]),
      }),
      tools: [
        createTool({
          name: 'tool-1',
          parameters: z.object({ value: z.string() }),
          execute: async ({ value }) => `${value}-result`,
        }),
      ],
      prompt: 'test-input',
    });

    assert.deepStrictEqual(
      await convertAsyncIterableToArray(result.fullStream),
      [
        {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'tool-1',
          args: { value: 'test-input' },
        },
        {
          type: 'tool-result',
          toolCallId: 'call-1',
          toolName: 'tool-1',
          result: 'test-input-result',
        },
      ],
    );
  });
});
