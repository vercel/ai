import {
  createCallbacksTransformer,
  readableFromAsyncIterable,
  type AIStreamCallbacksAndOptions,
} from './ai-stream';
import { createStreamDataTransformer } from './stream-data';

interface ChatCompletionResponseChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: ChatCompletionResponseChunkChoice[];
}

interface ChatCompletionResponseChunkChoice {
  index: number;
  delta: {
    role?: string;
    content?: string;
    tool_calls?: ToolCalls[];
  };
  finish_reason: string;
}

interface FunctionCall {
  name: string;
  arguments: string;
}

interface ToolCalls {
  id: 'null';
  type: 'function';
  function: FunctionCall;
}

async function* streamable(stream: AsyncIterable<ChatCompletionResponseChunk>) {
  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content;

    if (content === undefined || content === '') {
      continue;
    }

    yield content;
  }
}

/*
 * @deprecated Use the [Mistral provider](https://sdk.vercel.ai/providers/ai-sdk-providers/mistral) instead.
 */
export function MistralStream(
  response: AsyncGenerator<ChatCompletionResponseChunk, void, unknown>,
  callbacks?: AIStreamCallbacksAndOptions,
): ReadableStream {
  const stream = readableFromAsyncIterable(streamable(response));
  return stream
    .pipeThrough(createCallbacksTransformer(callbacks))
    .pipeThrough(createStreamDataTransformer());
}
