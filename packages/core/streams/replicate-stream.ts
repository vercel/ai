import { AIStream, type AIStreamCallbacks } from './ai-stream'
import type { Prediction } from 'replicate'

/**
 * Stream predictions from Replicate.
 * Only certain models are supported.
 * @see https://github.com/replicate/replicate-javascript#streaming
 */
export async function ReplicateStream(
  res: Prediction,
  cb?: AIStreamCallbacks
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

  return AIStream(eventStream, undefined, cb)
}
