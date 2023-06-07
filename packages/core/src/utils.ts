const decoder = new TextDecoder()
export function decodeAIStreamChunk(chunk: Uint8Array): string {
  // We are not sure if the chunk is a SEE or a bare token. Here we try to decode
  // the chunk as a SEE, and if it fails, we assume it's a bare token.
  const decoded = decoder.decode(chunk)
  try {
    const tokens = decoded.split('\n')
    return tokens.map(t => (t ? JSON.parse(t) : '')).join('')
  } catch (err) {
    return decoded
  }
}
