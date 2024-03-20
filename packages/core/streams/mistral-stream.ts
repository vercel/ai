import { ChatCompletionResponseChunk } from '@mistralai/mistralai';
import {
  createCallbacksTransformer,
  readableFromAsyncIterable,
  type AIStreamCallbacksAndOptions,
} from './ai-stream';
import { createStreamDataTransformer } from './stream-data';

async function* streamable(stream: AsyncIterable<ChatCompletionResponseChunk>) {
  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content;

    if (content === undefined || content === '') {
      continue;
    }

    yield content;
  }
}

export function MistralStream(
  response: AsyncGenerator<ChatCompletionResponseChunk, void, unknown>,
  callbacks?: AIStreamCallbacksAndOptions,
): ReadableStream {
  const stream = readableFromAsyncIterable(streamable(response));
  return stream
    .pipeThrough(createCallbacksTransformer(callbacks))
    .pipeThrough(createStreamDataTransformer());
}
