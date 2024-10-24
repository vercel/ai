import {
  createCallbacksTransformer,
  readableFromAsyncIterable,
  type AIStreamCallbacksAndOptions,
} from './ai-stream';
import { createStreamDataTransformer } from './stream-data';

interface GenerateContentResponse {
  candidates?: GenerateContentCandidate[];
}

interface GenerateContentCandidate {
  index: number;
  content: Content;
}

interface Content {
  role: string;
  parts: Part[];
}

type Part = TextPart | InlineDataPart | FileDataPart;

interface InlineDataPart {
  text?: never;
}

interface TextPart {
  text: string;
  inlineData?: never;
}

interface FileDataPart {
  text?: never;
  mimeType: string;
  fileUri: string;
}

async function* streamable(response: {
  stream: AsyncIterable<GenerateContentResponse>;
}) {
  for await (const chunk of response.stream) {
    const parts = chunk.candidates?.[0]?.content?.parts;

    if (parts === undefined) {
      continue;
    }

    const firstPart = parts[0];

    if (typeof firstPart.text === 'string') {
      yield firstPart.text;
    }
  }
}

/**
 * @deprecated Use the [Google Generative AI provider](https://sdk.vercel.ai/providers/ai-sdk-providers/google-generative-ai) instead.
 */
export function GoogleGenerativeAIStream(
  response: {
    stream: AsyncIterable<GenerateContentResponse>;
  },
  cb?: AIStreamCallbacksAndOptions,
): ReadableStream {
  return readableFromAsyncIterable(streamable(response))
    .pipeThrough(createCallbacksTransformer(cb))
    .pipeThrough(createStreamDataTransformer());
}
