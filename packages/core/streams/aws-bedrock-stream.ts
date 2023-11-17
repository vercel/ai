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

async function* extractTextDelta(res: AWSBedrockResponse) {
  const decoder = new TextDecoder();
  for await (const chunk of res.body ?? []) {
    const bytes = chunk.chunk?.bytes;
    if (bytes) {
      const chunkText = decoder.decode(bytes);
      const chunkJSON = JSON.parse(chunkText);
      yield chunkJSON.completion;
    }
  }
}

export function AWSBedrockAnthropicStream(
  res: AWSBedrockResponse,
  cb?: AIStreamCallbacksAndOptions,
): ReadableStream {
  return readableFromAsyncIterable(extractTextDelta(res))
    .pipeThrough(createCallbacksTransformer(cb))
    .pipeThrough(createStreamDataTransformer(cb?.experimental_streamData));
}
