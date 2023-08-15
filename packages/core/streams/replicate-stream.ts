import { AIStream, type AIStreamCallbacksAndOptions } from './ai-stream'
import type { Prediction } from 'replicate'
import { createStreamDataTransformer } from './stream-data'

/**
 * Stream predictions from Replicate.
 * Only certain models are supported and you must pass `stream: true` to
 * replicate.predictions.create().
 * @see https://github.com/replicate/replicate-javascript#streaming
 *
 * @example
 * const response = await replicate.predictions.create({
 *  stream: true,
 *  input: {
 *    prompt: messages.join('\n')
 *  },
 *  version: '2c1608e18606fad2812020dc541930f2d0495ce32eee50074220b87300bc16e1'
 * })
 *
 * const stream = await ReplicateStream(response)
 * return new StreamingTextResponse(stream)
 *
 */
export async function ReplicateStream(
  res: Prediction,
  cb?: AIStreamCallbacksAndOptions
): Promise<ReadableStream> {
  const url = res.urls?.stream

  if (!url) {
    if (res.error) throw new Error(res.error)
    else throw new Error('Missing stream URL in Replicate response')
  }

  const eventStream = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'text/event-stream'
    }
  })

  return AIStream(eventStream, undefined, cb).pipeThrough(
    createStreamDataTransformer(cb?.experimental_streamData)
  )
}
