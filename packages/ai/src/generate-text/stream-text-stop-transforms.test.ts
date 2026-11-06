import type { LanguageModelV4StreamPart } from '@ai-sdk/provider';
import type { ToolSet } from '@ai-sdk/provider-utils';
import {
  convertArrayToReadableStream,
  convertAsyncIterableToArray,
} from '@ai-sdk/provider-utils/test';
import { expect, it } from 'vitest';
import { MockLanguageModelV4 } from '../test/mock-language-model-v4';
import { streamText, type StreamTextTransform } from './stream-text';
import type { TextStreamPart } from './stream-text-result';

it('allows chained transforms to independently stop the same stream', async () => {
  const errors: unknown[] = [];
  const stops: string[] = [];
  const chunks: LanguageModelV4StreamPart[] = [
    { type: 'text-start', id: 'text-1' },
    { type: 'text-delta', id: 'text-1', delta: 'Hello' },
    { type: 'text-end', id: 'text-1' },
    {
      type: 'finish',
      finishReason: { unified: 'stop', raw: 'stop' },
      usage: {
        inputTokens: {
          total: 2,
          noCache: 2,
          cacheRead: undefined,
          cacheWrite: undefined,
        },
        outputTokens: { total: 1, text: 1, reasoning: undefined },
      },
    },
  ];
  const stopAfterStep: StreamTextTransform<ToolSet> = ({ stopStream }) =>
    new TransformStream<TextStreamPart<ToolSet>, TextStreamPart<ToolSet>>({
      transform(chunk, controller) {
        if (chunk.type === 'finish-step') {
          stops.push('step limit');
          stopStream();
        }
        controller.enqueue(chunk);
      },
    });
  const finalizeStep: StreamTextTransform<ToolSet> = ({ stopStream }) =>
    new TransformStream<TextStreamPart<ToolSet>, TextStreamPart<ToolSet>>({
      transform(chunk, controller) {
        if (chunk.type === 'finish-step') {
          stops.push('finalizer');
          stopStream();
          controller.enqueue(chunk);
          controller.enqueue({
            type: 'finish',
            finishReason: chunk.finishReason,
            rawFinishReason: chunk.rawFinishReason,
            totalUsage: chunk.usage,
          });
          return;
        }
        controller.enqueue(chunk);
      },
    });
  const result = streamText({
    model: new MockLanguageModelV4({
      doStream: async () => ({ stream: convertArrayToReadableStream(chunks) }),
    }),
    prompt: 'Hello',
    experimental_transform: [stopAfterStep, finalizeStep],
    onError: ({ error }) => {
      errors.push(error);
    },
  });

  const parts = await convertAsyncIterableToArray(result.fullStream);

  expect(parts.filter(part => part.type === 'finish')).toHaveLength(1);
  expect(await result.text).toBe('Hello');
  expect(await result.finishReason).toBe('stop');
  expect(stops).toEqual(['step limit', 'finalizer']);
  expect(errors).toEqual([]);
});
