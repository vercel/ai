import {
  generateId as generateIdFunc,
  type IdGenerator,
} from '@ai-sdk/provider-utils';
import type { UIMessage } from '../ui/ui-messages';
import { handleUIMessageStreamFinish } from './handle-ui-message-stream-finish';
import type { InferUIMessageChunk } from './ui-message-chunks';
import type { UIMessageStreamOnEndCallback } from './ui-message-stream-on-end-callback';
import type { UIMessageStreamOutcome } from './ui-message-stream-outcome';
import type { UIMessageStreamOnStepEndCallback } from './ui-message-stream-on-step-end-callback';
import type { UIMessageStreamOnStepFinishCallback } from './ui-message-stream-on-step-finish-callback';
import type { UIMessageStreamWriterWithOutcome } from './ui-message-stream-writer';

/**
 * Creates a UI message stream that can be used to send messages to the client.
 *
 * @param options.execute - A function that is called with a writer to write UI message chunks to the stream.
 * @param options.onError - A function that extracts an error message from an error. Defaults to `() => 'An error occurred.'` so server-side error details are not leaked to the client; supply your own to surface richer messages.
 * @param options.originalMessages - The original messages. If provided, persistence mode is assumed
 *   and a message ID is provided for the response message.
 * @param options.onStepEnd - A callback that is called when each step ends. Useful for persisting intermediate messages.
 * @param options.onStepFinish - Deprecated alias for `onStepEnd`.
 * @param options.onEnd - A callback that is called when the stream ends.
 * @param options.onFinish - Deprecated alias for `onEnd`.
 * @param options.generateId - A function that generates a unique ID. Defaults to the built-in ID generator.
 * @param options.abortSignal - Optional `AbortSignal` that propagates client-side cancellation
 *   (e.g. `useChat().stop()`) into this stream. When the signal aborts:
 *     - the same signal is exposed to `execute` so user code can short-circuit
 *       long-running work (e.g. break out of generation loops)
 *     - any in-flight `writer.merge` reads are cancelled at their source
 *     - subsequent `writer.write` calls become no-ops
 *     - the output `ReadableStream` is closed, so a wrapping
 *       `createUIMessageStreamResponse` terminates the HTTP body cleanly
 *
 *   To wire this up end-to-end, pass `request.signal` (or your framework's
 *   equivalent) from your route handler. Closes #9707.
 *
 * @returns A `ReadableStream` of UI message chunks.
 */
export function createUIMessageStream<UI_MESSAGE extends UIMessage>({
  execute,
  onError = () => 'An error occurred.', // prevent leaking server error details to the client by default
  originalMessages,
  onStepEnd,
  onStepFinish,
  onEnd,
  onFinish,
  generateId = generateIdFunc,
  abortSignal,
}: {
  execute: (options: {
    writer: UIMessageStreamWriterWithOutcome<UI_MESSAGE>;
    abortSignal?: AbortSignal;
  }) => Promise<void> | void;
  onError?: (error: unknown) => string;

  /**
   * The original messages. If they are provided, persistence mode is assumed,
   * and a message ID is provided for the response message.
   */
  originalMessages?: UI_MESSAGE[];

  /**
   * Callback that is called when each step ends during multi-step agent runs.
   */
  onStepEnd?: UIMessageStreamOnStepEndCallback<UI_MESSAGE>;

  /**
   * Callback that is called when each step ends during multi-step agent runs.
   *
   * @deprecated Use `onStepEnd` instead.
   */
  onStepFinish?: UIMessageStreamOnStepFinishCallback<UI_MESSAGE>;

  onEnd?: UIMessageStreamOnEndCallback<UI_MESSAGE>;

  /**
   * @deprecated Use `onEnd` instead.
   */
  onFinish?: UIMessageStreamOnEndCallback<UI_MESSAGE>;

  generateId?: IdGenerator;

  /**
   * Optional abort signal. Propagates client-side cancellation
   * (e.g. `useChat().stop()`) into this stream. See the function-level
   * JSDoc for the full contract.
   */
  abortSignal?: AbortSignal;
}): ReadableStream<InferUIMessageChunk<UI_MESSAGE>> {
  let controller!: ReadableStreamDefaultController<
    InferUIMessageChunk<UI_MESSAGE>
  >;

  const ongoingStreamPromises: Promise<void>[] = [];
  let outcome: UIMessageStreamOutcome = { status: 'unknown' };

  const stream = new ReadableStream({
    start(controllerArg) {
      controller = controllerArg;
    },
  });

  function safeEnqueue(data: InferUIMessageChunk<UI_MESSAGE>) {
    try {
      controller.enqueue(data);
    } catch {
      // suppress errors when the stream has been closed
    }
  }

  function setOutcome(newOutcome: UIMessageStreamOutcome) {
    if (outcome.status === 'unknown' && newOutcome.status !== 'unknown') {
      outcome = newOutcome;
    }
  }

  function failOutcome(error: unknown) {
    outcome = { status: 'failed', error };
  }

  function safeError(error: unknown) {
    try {
      controller.error(error);
    } catch {
      // suppress errors when the stream has been closed
    }
  }

  function handleError(error: unknown) {
    failOutcome(error);

    let errorText: string;
    try {
      errorText = onError(error);
    } catch (onErrorError) {
      failOutcome(onErrorError);
      safeError(onErrorError);
      return;
    }

    safeEnqueue({
      type: 'error',
      errorText,
    } as InferUIMessageChunk<UI_MESSAGE>);
  }

  function safeCloseController() {
    try {
      controller.close();
    } catch {
      // suppress errors when the stream has been closed already
    }
  }

  const abortStream = () => {
    setOutcome({ status: 'aborted' });
    safeCloseController();
  };

  // When the upstream signal aborts, close the output stream eagerly so any
  // SSE Response wrapping us terminates the HTTP body. Merge loops cancel
  // their source reader on the same signal below.
  if (abortSignal) {
    if (abortSignal.aborted) {
      abortStream();
    } else {
      abortSignal.addEventListener('abort', abortStream, {
        once: true,
      });
    }
  }

  try {
    const result = execute({
      writer: {
        write(part: InferUIMessageChunk<UI_MESSAGE>) {
          // Drop writes after abort so user code that didn't observe the
          // signal mid-loop still terminates cleanly without enqueuing
          // ghost tokens onto a closed controller.
          if (abortSignal?.aborted) {
            return;
          }
          safeEnqueue(part);
        },
        merge(streamArg) {
          ongoingStreamPromises.push(
            (async () => {
              const reader = streamArg.getReader();
              const cancelOnAbort = () => {
                void reader.cancel(abortSignal?.reason).catch(() => {
                  // suppress: reader may already be closed / locked
                });
              };
              if (abortSignal) {
                if (abortSignal.aborted) {
                  cancelOnAbort();
                } else {
                  abortSignal.addEventListener('abort', cancelOnAbort, {
                    once: true,
                  });
                }
              }
              try {
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  safeEnqueue(value);
                }
              } finally {
                abortSignal?.removeEventListener('abort', cancelOnAbort);
              }
            })().catch(error => {
              handleError(error);
            }),
          );
        },
        setOutcome,
        onError,
      },
      abortSignal,
    });

    if (result) {
      ongoingStreamPromises.push(
        result.catch(error => {
          handleError(error);
        }),
      );
    }
  } catch (error) {
    handleError(error);
  }

  // Wait until all ongoing streams are done. This approach enables merging
  // streams even after execute has returned, as long as there is still an
  // open merged stream. This is important to e.g. forward new streams and
  // from callbacks.
  const waitForStreams: Promise<void> = (async () => {
    while (ongoingStreamPromises.length > 0) {
      await ongoingStreamPromises.shift();
    }
  })();

  waitForStreams.finally(() => {
    try {
      controller.close();
    } catch {
      // suppress errors when the stream has been closed
    }
  });

  return handleUIMessageStreamFinish<UI_MESSAGE>({
    stream,
    messageId: generateId(),
    originalMessages,
    onStepEnd: onStepEnd ?? onStepFinish,
    onEnd: onEnd ?? onFinish,
    onError,
    getOutcome: () => outcome,
  });
}
