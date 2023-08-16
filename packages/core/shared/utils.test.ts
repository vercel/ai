import { createChunkDecoder, getStreamString } from './utils'

describe('utils', () => {
  it('correctly decodes streamed utf8 chunks in complex mode', () => {
    const normalDecode = createChunkDecoder()
    const complexDecode = createChunkDecoder(true)

    const encoder = new TextEncoder()

    // Original data chunks
    const chunk1 = new Uint8Array([226, 153])
    const chunk2 = new Uint8Array([165])

    const enqueuedChunks = []
    enqueuedChunks.push(
      encoder.encode(getStreamString('text', normalDecode(chunk1)))
    )
    enqueuedChunks.push(
      encoder.encode(getStreamString('text', normalDecode(chunk2)))
    )

    let fullDecodedString = ''
    for (const chunk of enqueuedChunks) {
      const lines = complexDecode(chunk)
      for (const line of lines) {
        if (line.type !== 'text') {
          throw new Error('Expected line to be text')
        }
        fullDecodedString += line.value
      }
    }

    expect(fullDecodedString).toBe('♥')
  })

  it('correctly decodes streamed utf8 chunks in simple mode', () => {
    const decoder = createChunkDecoder(false)
    const encoder = new TextEncoder()
    // const prefixChunkUint8 = encoder.encode('0:')
    const chunk1 = new Uint8Array([226, 153])
    const chunk2 = new Uint8Array([165])
    const values = decoder(chunk1)
    const secondValues = decoder(chunk2)
    if (typeof values !== 'string' || typeof secondValues !== 'string') {
      throw new Error('Expected values to be strings, not objects')
    }

    expect(values + secondValues).toBe('♥')
  })
})
