import {
  AIStream,
  readableFromAsyncIterable,
  type AIStreamCallbacksAndOptions,
  createCallbacksTransformer
} from './ai-stream'
import { createStreamDataTransformer } from './stream-data'

// https://github.com/anthropics/anthropic-sdk-typescript/blob/0fc31f4f1ae2976afd0af3236e82d9e2c84c43c9/src/resources/completions.ts#L28-L49
interface CompletionChunk {
  /**
   * The resulting completion up to and excluding the stop sequences.
   */
  completion: string

  /**
   * The model that performed the completion.
   */
  model: string

  /**
   * The reason that we stopped sampling.
   *
   * This may be one the following values:
   *
   * - `"stop_sequence"`: we reached a stop sequence — either provided by you via the
   *   `stop_sequences` parameter, or a stop sequence built into the model
   * - `"max_tokens"`: we exceeded `max_tokens_to_sample` or the model's maximum
   */
  stop_reason: string
}

interface StreamError {
  error: {
    type: string
    message: string
  }
}

interface StreamPing {}

type StreamData = CompletionChunk | StreamError | StreamPing

function parseAnthropicStream(): (data: string) => string | void {
  let previous = ''

  return data => {
    const json = JSON.parse(data as string) as StreamData

    // error event
    if ('error' in json) {
      throw new Error(`${json.error.type}: ${json.error.message}`)
    }

    // ping event
    if (!('completion' in json)) {
      return
    }

    // On API versions older than 2023-06-01,
    // Anthropic's `completion` field is cumulative unlike OpenAI's
    // deltas. In order to compute the delta, we must slice out the text
    // we previously received.
    const text = json.completion
    if (
      !previous ||
      (text.length > previous.length && text.startsWith(previous))
    ) {
      const delta = text.slice(previous.length)
      previous = text

      return delta
    }

    return text
  }
}

async function* streamable(stream: AsyncIterable<CompletionChunk>) {
  for await (const chunk of stream) {
    const text = chunk.completion
    if (text) yield text
  }
}

/**
 * Accepts either a fetch Response from the Anthropic `POST /v1/complete` endpoint,
 * or the return value of `await client.completions.create({ stream: true })`
 * from the `@anthropic-ai/sdk` package.
 */
export function AnthropicStream(
  res: Response | AsyncIterable<CompletionChunk>,
  cb?: AIStreamCallbacksAndOptions
): ReadableStream {
  if (Symbol.asyncIterator in res) {
    return readableFromAsyncIterable(streamable(res))
      .pipeThrough(createCallbacksTransformer(cb))
      .pipeThrough(createStreamDataTransformer(cb?.experimental_streamData))
  } else {
    return AIStream(res, parseAnthropicStream(), cb).pipeThrough(
      createStreamDataTransformer(cb?.experimental_streamData)
    )
  }
}
