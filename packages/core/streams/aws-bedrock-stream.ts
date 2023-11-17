import {
  AIStreamCallbacksAndOptions,
  createCallbacksTransformer,
  readableFromAsyncIterable,
} from './ai-stream';
import { createStreamDataTransformer } from './stream-data';

interface AWSBedrockResponse {
  body?: AsyncIterable<{
    chunk?: {
      bytes?: Uint8Array;
    };
  }>;
}

async function* asDeltaIterable(
  res: AWSBedrockResponse,
  extractTextDeltaFromChunk: (chunk: any) => string,
) {
  const decoder = new TextDecoder();
  for await (const chunk of res.body ?? []) {
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

export function AWSBedrockAnthropicStream(
  res: AWSBedrockResponse,
  cb?: AIStreamCallbacksAndOptions,
): ReadableStream {
  return AWSBedrockStream(res, cb, chunk => chunk.completion);
}

export function AWSBedrockCohereStream(
  res: AWSBedrockResponse,
  cb?: AIStreamCallbacksAndOptions,
): ReadableStream {
  return AWSBedrockStream(res, cb, chunk => chunk.generations?.[0]?.text);
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
    .pipeThrough(
      createStreamDataTransformer(callbacks?.experimental_streamData),
    );
}
