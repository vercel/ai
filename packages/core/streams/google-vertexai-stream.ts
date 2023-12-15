import {
  createCallbacksTransformer,
  readableFromAsyncIterable,
  type AIStreamCallbacksAndOptions,
} from './ai-stream';
import { createStreamDataTransformer } from './stream-data';

interface GenerateContentResponse {
  candidates: GenerateContentCandidate[];
}

interface GenerateContentCandidate {
  content: Content;
  index?: number;
}

interface Content {
  parts: Part[];
}

type Part = TextPart | InlineDataPart | FileDataPart;

interface TextPart {
  text: string;
  inline_data?: never;
}

interface InlineDataPart {
  text?: never;
  inline_data: GenerativeContentBlob;
}

interface GenerativeContentBlob {
  mime_type: string;
  data: string;
}

interface FileDataPart {
  text?: never;
  file_data: FileData;
}

interface FileData {
  mime_type: string;
  file_uri: string;
}

async function* streamable(response: {
  stream: AsyncGenerator<GenerateContentResponse>;
}) {
  for await (const chunk of response.stream) {
    const parts = chunk.candidates[0].content.parts;
    const firstPart = parts[0];

    if (typeof firstPart.text === 'string') {
      yield firstPart.text;
    }
  }
}

export function GoogleVertexAIStream(
  response: {
    stream: AsyncGenerator<GenerateContentResponse>;
  },
  cb?: AIStreamCallbacksAndOptions,
): ReadableStream {
  return readableFromAsyncIterable(streamable(response))
    .pipeThrough(createCallbacksTransformer(cb))
    .pipeThrough(createStreamDataTransformer(cb?.experimental_streamData));
}
