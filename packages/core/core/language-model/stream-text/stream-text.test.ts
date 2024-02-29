import assert from 'node:assert';
import { z } from 'zod';
import { convertArrayToReadableStream } from '../test/convert-array-to-readable-stream';
import { convertAsyncIterableToArray } from '../test/convert-async-iterable-to-array';
import { MockLanguageModel } from '../test/mock-language-model';
import { streamText } from './stream-text';

describe('result.textStream', () => {
  it('should send text deltas as textStream', async () => {
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
  it('should send all text parts as fullStream', async () => {
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

  it("should send tool call parts as fullStream if they're present", async () => {
    const result = await streamText({
      model: new MockLanguageModel({
        doStream: async ({ prompt }) =>
          convertArrayToReadableStream([
            {
              type: 'tool-call',
              toolCallId: 'call-1',
              toolName: 'tool-1',
              args: { name: prompt },
            },
          ]),
      }),
      tools: [
        {
          name: 'tool-1',
          parameters: z.object({
            name: z.string(),
          }),
        },
      ],
      prompt: 'test',
    });

    assert.deepStrictEqual(
      await convertAsyncIterableToArray(result.fullStream),
      [
        {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'tool-1',
          args: { name: 'test' },
        },
      ],
    );
  });
});
