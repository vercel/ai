import {
  convertArrayToReadableStream,
  convertReadableStreamToArray,
} from '@ai-sdk/provider-utils/test';
import { MockTracer } from '../test/mock-tracer';
import { runToolsTransformation } from './run-tools-transformation';
import { LanguageModelV1StreamPart } from '@ai-sdk/provider';

it('should forward text deltas correctly', async () => {
  const inputStream: ReadableStream<LanguageModelV1StreamPart> =
    convertArrayToReadableStream([
      { type: 'text-delta', textDelta: 'text' },
      {
        type: 'finish',
        finishReason: 'stop',
        logprobs: undefined,
        usage: { completionTokens: 10, promptTokens: 3 },
      },
    ]);

  const transformedStream = runToolsTransformation({
    tools: undefined,
    generatorStream: inputStream,
    toolCallStreaming: false,
    tracer: new MockTracer(),
    telemetry: undefined,
    abortSignal: undefined,
  });

  const result = await convertReadableStreamToArray(transformedStream);

  expect(result).toEqual([
    { type: 'text-delta', textDelta: 'text' },
    {
      type: 'finish',
      finishReason: 'stop',
      logprobs: undefined,
      usage: { completionTokens: 10, promptTokens: 3, totalTokens: 13 },
      experimental_providerMetadata: undefined,
    },
  ]);
});
