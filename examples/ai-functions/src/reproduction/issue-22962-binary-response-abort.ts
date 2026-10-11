import { createCartesia } from '@ai-sdk/cartesia';
import { APICallError } from '@ai-sdk/provider';

type Phase = 'before-headers' | 'during-body' | 'body-read-failure';

async function run(phase: Phase) {
  const abortController = new AbortController();
  const abortReason = new DOMException('Cancelled by user', 'AbortError');
  const bodyReadFailure = new Error('Synthetic body read failure');

  const provider = createCartesia({
    apiKey: 'synthetic',
    fetch: async (_url, init) => {
      const signal = init?.signal;

      if (phase === 'before-headers') {
        abortController.abort(abortReason);
        throw abortReason;
      }

      if (signal == null) {
        throw new Error(
          'Control failure: Cartesia request omitted abort signal',
        );
      }

      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array([1, 2]));

            if (phase === 'during-body') {
              signal?.addEventListener(
                'abort',
                () => controller.error(signal.reason),
                { once: true },
              );
              setTimeout(() => abortController.abort(abortReason), 10);
            } else {
              setTimeout(() => controller.error(bodyReadFailure), 10);
            }
          },
        }),
        { headers: { 'content-type': 'audio/mpeg' } },
      );
    },
  });

  try {
    await provider.speech('sonic-3').doGenerate({
      text: 'Hello',
      voice: 'synthetic-voice',
      abortSignal: abortController.signal,
    });
  } catch (error) {
    console.log(
      JSON.stringify({
        phase,
        name: error instanceof Error ? error.name : undefined,
        sameAbortReason: error === abortReason,
        causeName:
          error instanceof Error && error.cause instanceof Error
            ? error.cause.name
            : undefined,
      }),
    );

    return { error, abortReason, bodyReadFailure };
  }

  throw new Error(`Expected ${phase} to reject`);
}

async function main() {
  const beforeHeaders = await run('before-headers');
  const duringBody = await run('during-body');
  const bodyReadFailure = await run('body-read-failure');

  if (beforeHeaders.error !== beforeHeaders.abortReason) {
    throw new Error(
      'Control failure: cancellation before headers did not preserve the original AbortError',
    );
  }

  if (
    !APICallError.isInstance(bodyReadFailure.error) ||
    bodyReadFailure.error.cause !== bodyReadFailure.bodyReadFailure
  ) {
    throw new Error(
      'Control failure: ordinary binary body read failure was not wrapped in APICallError',
    );
  }

  if (duringBody.error !== duringBody.abortReason) {
    throw new Error(
      'Issue #22962 reproduced: cancellation during binary response body was wrapped in AI_APICallError instead of preserving the original AbortError',
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
