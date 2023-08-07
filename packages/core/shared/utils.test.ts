import { createChunkDecoder } from './utils'

describe('utils', () => {
  it('correctly decode streamed utf8 chunks', () => {
    const decoder = createChunkDecoder()
    const encoder = new TextEncoder()
    const prefixChunkUint8 = encoder.encode('0:')
    const chunk1 = new Uint8Array([...prefixChunkUint8, 226, 153])
    const chunk2 = new Uint8Array([...prefixChunkUint8, 165])
    const { value: decodedValue1 } = decoder(chunk1)
    const { value: decodedValue2 } = decoder(chunk2)
    console.log(decodedValue1, decodedValue2)
    expect(decodedValue1 + decodedValue2).toBe('♥')
  })
})
