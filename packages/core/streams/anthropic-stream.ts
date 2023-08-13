import {
  AIStream,
  readableFromAsyncIterable,
  type AIStreamCallbacks,
  createCallbacksTransformer
} from './ai-stream'

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

/**
 * Intended for API versions before 2023-06-01
 */
function parseAnthropicStreamLegacy(): (data: string) => string | void {
  let previous = ''

  return data => {
    const json = JSON.parse(data as string) as CompletionChunk

    // On API versions older than 2023-06-01,
    // Anthropic's `completion` field is cumulative unlike OpenAI's
    // deltas. In order to compute the delta, we must slice out the text
    // we previously received.
    const text = json.completion
    const delta = text.slice(previous.length)
    previous = text

    return delta
  }
}

/**
 * Intended for v2023-06-01 and greater,
 * but may need to be adjusted for future versions.
 * https://docs.anthropic.com/claude/reference/versioning#version-history
 */
function parseAnthropicStream(): (data: string) => string | void {
  return data => {
    const json = JSON.parse(data as string) as CompletionChunk
    const delta = json.completion
    return delta
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
  cb?: AIStreamCallbacks
): ReadableStream {
  if (Symbol.asyncIterator in res) {
    return readableFromAsyncIterable(streamable(res)).pipeThrough(
      createCallbacksTransformer(cb)
    )
  } else {
    const apiVersion = res.headers.get('anthropic-version')

    // TODO(2023-12-01): after this version has been out for a while,
    // assume a missing version header means the newer version.
    if (!apiVersion || apiVersion === '2023-01-01') {
      return AIStream(res, parseAnthropicStreamLegacy(), cb)
    }

    return AIStream(res, parseAnthropicStream(), cb)
  }
}
