import { type AIStreamCallbacks, createCallbacksTransformer } from './ai-stream'

const utf8Decoder = new TextDecoder('utf-8')

// Helper function to iterate over the stream due an edge-case  of"network buffering"
// which can cause the response to be split into multiple chunks or "glued chunks"
// E.g.: `{ "text": "Hello, " }\n{ "text": "world!" }\n`
async function* makeTextLineIterator(
  reader: ReadableStreamDefaultReader<Uint8Array>
) {
  let { value: chunk, done: readerDone } = await reader.read()
  let segment = utf8Decoder.decode(chunk, { stream: true })

  let re = /\r\n|\n|\r/gm
  let startIndex = 0

  while (true) {
    const result = re.exec(segment)

    if (!result) {
      if (readerDone) {
        break
      }
      let remainder = segment.substring(startIndex)

      const next = await reader.read()
      chunk = next.value
      readerDone = next.done

      segment = remainder
      if (chunk) {
        segment += utf8Decoder.decode(chunk)
      }

      startIndex = re.lastIndex = 0
      continue
    }

    yield segment.substring(startIndex, result.index)
    startIndex = re.lastIndex
  }

  if (startIndex < segment.length) {
    // last line didn't end in a newline char
    yield segment.substring(startIndex)
  }
}

function createParser(res: Response) {
  const reader = res.body?.getReader()
  return new ReadableStream<string>({
    async pull(controller): Promise<void> {
      if (!reader) {
        controller.close()
        return
      }

      for await (const line of makeTextLineIterator(reader)) {
        const { text, is_finished } = JSON.parse(line)

        if (is_finished === true) {
          controller.close()
        } else {
          controller.enqueue(text)
        }
      }

      controller.close()
    }
  })
}

export function CohereStream(
  reader: Response,
  callbacks?: AIStreamCallbacks
): ReadableStream {
  return createParser(reader).pipeThrough(createCallbacksTransformer(callbacks))
}
