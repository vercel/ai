import {
  AIStreamCallbacksAndOptions,
  createCallbacksTransformer,
  readableFromAsyncIterable,
} from './ai-stream';
import { createStreamDataTransformer } from './stream-data';

interface AWSBedrockResponse {
  body?: AsyncIterable<{
    chunk?: { bytes?: Uint8Array };
  }>;
}

async function* asDeltaIterable(
  response: AWSBedrockResponse,
  extractTextDeltaFromChunk: (chunk: any) => string,
) {
  const decoder = new TextDecoder();
  for await (const chunk of response.body ?? []) {
    const bytes = chunk.chunk?.bytes;

    if (bytes != null) {
      const chunkText = decoder.decode(bytes);
      const chunkJSON = JSON.parse(chunkText);
      const delta = extractTextDeltaFromChunk(chunkJSON);

      if (delta != null) {
        yield delta;
      }
    }
  }
}

export function AWSBedrockAnthropicMessagesStream(
  response: AWSBedrockResponse,
  callbacks?: AIStreamCallbacksAndOptions,
): ReadableStream {
  return AWSBedrockStream(response, callbacks, chunk => chunk.delta?.text);
}

export function AWSBedrockAnthropicStream(
  response: AWSBedrockResponse,
  callbacks?: AIStreamCallbacksAndOptions,
): ReadableStream {
  return AWSBedrockStream(response, callbacks, chunk => chunk.completion);
}

export function AWSBedrockCohereStream(
  response: AWSBedrockResponse,
  callbacks?: AIStreamCallbacksAndOptions,
): ReadableStream {
  return AWSBedrockStream(response, callbacks, chunk => chunk?.text);
}

export function AWSBedrockLlama2Stream(
  response: AWSBedrockResponse,
  callbacks?: AIStreamCallbacksAndOptions,
): ReadableStream {
  return AWSBedrockStream(response, callbacks, chunk => chunk.generation);
}

export function AWSBedrockStream(
  response: AWSBedrockResponse,
  callbacks: AIStreamCallbacksAndOptions | undefined,
  extractTextDeltaFromChunk: (chunk: any) => string,
) {
  return readableFromAsyncIterable(
    asDeltaIterable(response, extractTextDeltaFromChunk),
  )
    .pipeThrough(createCallbacksTransformer(callbacks))
    .pipeThrough(createStreamDataTransformer());
}
