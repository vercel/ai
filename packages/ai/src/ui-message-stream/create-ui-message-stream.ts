import {
  generateId as generateIdFunc,
  getErrorMessage,
  type IdGenerator,
} from '@ai-sdk/provider-utils';
import type { UIMessage } from '../ui/ui-messages';
import { handleUIMessageStreamFinish } from './handle-ui-message-stream-finish';
import type { InferUIMessageChunk } from './ui-message-chunks';
import type { UIMessageStreamOnFinishCallback } from './ui-message-stream-on-finish-callback';
import type { UIMessageStreamOnStepFinishCallback } from './ui-message-stream-on-step-finish-callback';
import type { UIMessageStreamWriter } from './ui-message-stream-writer';

/**
 * Creates a UI message stream that can be used to send messages to the client.
 *
 * @param options.execute - A function that is called with a writer to write UI message chunks to the stream.
 * @param options.onError - A function that extracts an error message from an error. Defaults to `getErrorMessage`.
 * @param options.originalMessages - The original messages. If provided, persistence mode is assumed
 *   and a message ID is provided for the response message.
 * @param options.onStepFinish - A callback that is called when each step finishes. Useful for persisting intermediate messages.
 * @param options.onFinish - A callback that is called when the stream finishes.
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
  onError = getErrorMessage,
  originalMessages,
  onStepFinish,
  onFinish,
  generateId = generateIdFunc,
  abortSignal,
}: {
  execute: (options: {
    writer: UIMessageStreamWriter<UI_MESSAGE>;
    abortSignal?: AbortSignal;
  }) => Promise<void> | void;
  onError?: (error: unknown) => string;

  /**
   * The original messages. If they are provided, persistence mode is assumed,
   * and a message ID is provided for the response message.
   */
  originalMessages?: UI_MESSAGE[];

  /**
   * Callback that is called when each step finishes during multi-step agent runs.
   */
  onStepFinish?: UIMessageStreamOnStepFinishCallback<UI_MESSAGE>;

  onFinish?: UIMessageStreamOnFinishCallback<UI_MESSAGE>;

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

  function safeCloseController() {
    try {
      controller.close();
    } catch {
      // suppress errors when the stream has been closed already
    }
  }

  // When the upstream signal aborts, close the output stream eagerly so any
  // SSE Response wrapping us terminates the HTTP body. Merge loops cancel
  // their source reader on the same signal below.
  if (abortSignal) {
    if (abortSignal.aborted) {
      safeCloseController();
    } else {
      abortSignal.addEventListener('abort', safeCloseController, {
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
              safeEnqueue({
                type: 'error',
                errorText: onError(error),
              } as InferUIMessageChunk<UI_MESSAGE>);
            }),
          );
        },
        onError,
      },
      abortSignal,
    });

    if (result) {
      ongoingStreamPromises.push(
        result.catch(error => {
          safeEnqueue({
            type: 'error',
            errorText: onError(error),
          } as InferUIMessageChunk<UI_MESSAGE>);
        }),
      );
    }
  } catch (error) {
    safeEnqueue({
      type: 'error',
      errorText: onError(error),
    } as InferUIMessageChunk<UI_MESSAGE>);
  }

  // Wait until all ongoing streams are done. This approach enables merging
  // streams even after execute has returned, as long as there is still an
  // open merged stream. This is important to e.g. forward new streams and
  // from callbacks.
  const waitForStreams: Promise<void> = new Promise(async resolve => {
    while (ongoingStreamPromises.length > 0) {
      await ongoingStreamPromises.shift();
    }
    resolve();
  });

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
    onStepFinish,
    onFinish,
    onError,
  });
}
