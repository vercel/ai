import { Suspense } from 'react'

type Props = {
  /**
   * A ReadableStream produced by the AI SDK.
   */
  stream: ReadableStream
  /**
   * A function that is called at the start of the stream.
   */
  onStart?: () => Promise<void>
  /**
   * A function that is called for each token processed.
   */
  onToken?: (token: string) => Promise<void>
  /**
   * A function that is called once the stream has been processed.
   */
  onEnd?: () => Promise<void>
}

/**
 * A React Server Component that recursively renders a stream of tokens.
 */
export async function Tokens(props: Props) {
  const { stream, onEnd, onStart, onToken } = props

  if (onStart) {
    await onStart()
  }

  const reader = stream.getReader()

  return (
    /* @ts-expect-error Suspense */
    <Suspense>
      {/* @ts-expect-error React Server Components */}
      <RecursiveTokens
        reader={reader}
        onEnd={onEnd}
        onStart={onStart}
        onToken={onToken}
      />
    </Suspense>
  )
}

type InternalProps = {
  reader: ReadableStreamDefaultReader
} & Omit<Props, 'stream'>

async function RecursiveTokens({
  reader,
  onEnd,
  onStart,
  onToken
}: InternalProps) {
  const { done, value } = await reader.read()

  if (done) {
    if (onEnd) {
      await onEnd()
    }

    return null
  }

  const text = new TextDecoder().decode(value)

  if (onToken) {
    await onToken(text)
  }

  return (
    <>
      {text}
      {/* @ts-expect-error Suspense */}
      <Suspense fallback={null}>
        {/* @ts-expect-error React Server Components */}
        <RecursiveTokens
          reader={reader}
          onEnd={onEnd}
          onStart={onStart}
          onToken={onToken}
        />
      </Suspense>
    </>
  )
}
