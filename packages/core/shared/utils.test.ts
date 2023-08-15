import { createChunkDecoder } from './utils'

describe('utils', () => {
  it('correctly decodes streamed utf8 chunks in complex mode', () => {
    const decoder = createChunkDecoder(true)
    const encoder = new TextEncoder()
    const prefixChunkUint8 = encoder.encode('0:')
    const chunk1 = new Uint8Array([...prefixChunkUint8, 226, 153])
    const chunk2 = new Uint8Array([...prefixChunkUint8, 165])
    const values = decoder(chunk1)
    const secondValues = decoder(chunk2)
    if (typeof values === 'string' || typeof secondValues === 'string') {
      throw new Error('Expected values to be objects, not strings')
    }

    expect(values[0].value + secondValues[0].value).toBe('♥')
  })

  it('correctly decodes streamed utf8 chunks in simple mode', () => {
    const decoder = createChunkDecoder(false)
    const encoder = new TextEncoder()
    const prefixChunkUint8 = encoder.encode('0:')
    const chunk1 = new Uint8Array([...prefixChunkUint8, 226, 153])
    const chunk2 = new Uint8Array([...prefixChunkUint8, 165])
    const values = decoder(chunk1)
    const secondValues = decoder(chunk2)
    if (typeof values !== 'string' || typeof secondValues !== 'string') {
      throw new Error('Expected values to be strings, not objects')
    }

    expect(values + secondValues).toBe('♥')
  })
})
