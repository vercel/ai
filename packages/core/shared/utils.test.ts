import { createChunkDecoder } from './utils'

describe('utils', () => {
  it('correctly decode streamed utf8 chunks', () => {
    const decoder = createChunkDecoder()
    // Without `stream: true` this will fail.
    const chunk1 = new Uint8Array([226, 153])
    const chunk2 = new Uint8Array([165])
    expect(decoder(chunk1) + decoder(chunk2)).toBe('♥')
  })
})
