import { AIStream, type AIStreamCallbacks } from './ai-stream'

function parseAnthropicStream(): (data: string) => string | void {
  let previous = Buffer.from('', 'utf8')

  return data => {
    const json = JSON.parse(data as string) as {
      completion: string
      stop: string | null
      stop_reason: string | null
      truncated: boolean
      log_id: string
      model: string
      exception: string | null
    }

    // Convert the incoming text to a buffer.
    const textBuffer = Buffer.from(json.completion, 'utf8')

    // If the new buffer is longer, slice out the new part.
    const deltaBuffer = textBuffer.length > previous.length
      ? textBuffer.slice(previous.length)
      : Buffer.from('', 'utf8')
    
    // Store the full text for the next comparison.
    previous = textBuffer

    // Convert the delta back to a string for further processing.
    const delta = deltaBuffer.toString('utf8')

    return delta
  }
}

export function AnthropicStream(
  res: Response,
  cb?: AIStreamCallbacks
): ReadableStream {
  return AIStream(res, parseAnthropicStream(), cb)
}
