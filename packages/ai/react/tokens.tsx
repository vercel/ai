import { Suspense } from 'react';

type Props = {
  /**
   * A ReadableStream produced by the AI SDK.
   */
  stream: ReadableStream;
};

/**
A React Server Component that recursively renders a stream of tokens.
Can only be used inside of server components.

@deprecated Use RSCs / Generative AI instead.
 */
export async function Tokens(props: Props) {
  const { stream } = props;
  const reader = stream.getReader();

  return (
    <Suspense>
      {/* @ts-expect-error React Server Components */}
      <RecursiveTokens reader={reader} />
    </Suspense>
  );
}

type InternalProps = {
  reader: ReadableStreamDefaultReader;
};

async function RecursiveTokens({ reader }: InternalProps) {
  const { done, value } = await reader.read();

  if (done) {
    return null;
  }

  const text = new TextDecoder().decode(value);

  return (
    <>
      {text}
      <Suspense fallback={null}>
        {/* @ts-expect-error React Server Components */}
        <RecursiveTokens reader={reader} />
      </Suspense>
    </>
  );
}
