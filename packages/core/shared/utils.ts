import { customAlphabet } from 'nanoid/non-secure'
import { JSONValue } from './types'

// 7-character random string
export const nanoid = customAlphabet(
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
  7
)

// Type overloads
// FIXME: Uncomment this when the complex decoder implemented in all framework files.
// function createChunkDecoder(): (chunk: Uint8Array | undefined) => string
// function createChunkDecoder(
//   complex?: false
// ): (chunk: Uint8Array | undefined) => string
// function createChunkDecoder(complex?: true): (
//   chunk: Uint8Array | undefined
// ) => {
//   type: keyof typeof StreamStringPrefixes
//   value: string
// }[]

function createChunkDecoder(complex?: boolean) {
  const decoder = new TextDecoder()

  if (!complex) {
    return function (chunk: Uint8Array | undefined): string {
      if (!chunk) return ''
      return decoder.decode(chunk, { stream: true })
    }
  }

  return function (chunk: Uint8Array | undefined) {
    const decoded = decoder.decode(chunk, { stream: true }).split('\n')
    return decoded.map(getStreamStringTypeAndValue).filter(Boolean) as any
  }
}

export { createChunkDecoder }

/**
 * The map of prefixes for data in the stream
 *
 * - 0: Text from the LLM response
 * - 1: (OpenAI) function_call responses
 * - 2: custom JSON added by the user using `Data`
 *
 * Example:
 * ```
 * 0:Vercel
 * 0:'s
 * 0: AI
 * 0: AI
 * 0: SDK
 * 0: is great
 * 0:!
 * 2: { "someJson": "value" }
 * 1: {"function_call": {"name": "get_current_weather", "arguments": "{\\n\\"location\\": \\"Charlottesville, Virginia\\",\\n\\"format\\": \\"celsius\\"\\n}"}}
 *```
 */
export const StreamStringPrefixes = {
  text: 0,
  function_call: 1,
  data: 2
  // user_err: 3?
} as const

export const isStreamStringEqualToType = (
  type: keyof typeof StreamStringPrefixes,
  value: string
): value is StreamString =>
  value.startsWith(`${StreamStringPrefixes[type]}:`) && value.endsWith('\n')

/**
 * Prepends a string with a prefix from the `StreamChunkPrefixes`, JSON-ifies it, and appends a new line.
 */
export const getStreamString = (
  type: keyof typeof StreamStringPrefixes,
  value: JSONValue
): StreamString => `${StreamStringPrefixes[type]}:${JSON.stringify(value)}\n`

export type StreamString =
  `${(typeof StreamStringPrefixes)[keyof typeof StreamStringPrefixes]}:${string}\n`

export const getStreamStringTypeAndValue = (
  line: string
): { type: keyof typeof StreamStringPrefixes; value: string } => {
  // const split = line.split(':', 2)
  const firstSeperatorIndex = line.indexOf(':')
  const prefix = line.slice(0, firstSeperatorIndex)
  const type = Object.keys(StreamStringPrefixes).find(
    key =>
      StreamStringPrefixes[key as keyof typeof StreamStringPrefixes] ===
      Number(prefix)
  ) as keyof typeof StreamStringPrefixes

  const val = line.slice(firstSeperatorIndex + 1)

  let parsedVal = val

  if (!val) {
    return { type, value: '' }
  }

  try {
    parsedVal = JSON.parse(val)
  } catch (e) {
    console.error('Failed to parse JSON value:', val)
  }

  return { type, value: parsedVal }
}

/**
 * A header sent to the client so it knows how to handle parsing the stream (as a deprecated text response or using the new prefixed protocol)
 */
export const COMPLEX_HEADER = 'X-Experimental-Stream-Data'
