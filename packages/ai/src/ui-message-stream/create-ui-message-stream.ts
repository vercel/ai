import {
  generateId as generateIdFunc,
  type IdGenerator,
} from '@ai-sdk/provider-utils';
import { InvalidArgumentError } from '../error/invalid-argument-error';
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
 * @param options.maxBufferedChunks - Maximum number of merged-stream chunks to buffer before pausing upstream reads. Direct `writer.write` calls are not covered. By default, merged streams are consumed eagerly.
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
  maxBufferedChunks,
}: {
  execute: (options: {
    writer: UIMessageStreamWriterWithOutcome<UI_MESSAGE>;
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
   * Maximum number of chunks from merged streams that may be buffered before
   * upstream reads are paused. Reads resume as the returned stream is
   * consumed. Multiple merged streams are read in round-robin order.
   *
   * This limit does not apply to synchronous `writer.write` calls or buffering
   * performed inside a merged source stream. When omitted, merged streams are
   * consumed eagerly for backwards compatibility.
   */
  maxBufferedChunks?: number;
}): ReadableStream<InferUIMessageChunk<UI_MESSAGE>> {
  if (
    maxBufferedChunks != null &&
    (!Number.isSafeInteger(maxBufferedChunks) || maxBufferedChunks < 1)
  ) {
    throw new InvalidArgumentError({
      parameter: 'maxBufferedChunks',
      value: maxBufferedChunks,
      message: 'maxBufferedChunks must be a positive safe integer.',
    });
  }

  let controller!: ReadableStreamDefaultController<
    InferUIMessageChunk<UI_MESSAGE>
  >;

  type BoundedSource = {
    reader: ReadableStreamDefaultReader<InferUIMessageChunk<UI_MESSAGE>>;
    inFlight: boolean;
    active: boolean;
    resolve: () => void;
    reject: (error: unknown) => void;
  };

  const ongoingStreamPromises: Promise<void>[] = [];
  const activeReaders = new Set<
    ReadableStreamDefaultReader<InferUIMessageChunk<UI_MESSAGE>>
  >();
  const boundedSources: BoundedSource[] = [];
  // Keep merge capacity reserved while chunks travel through the finish
  // processing pipeline. The reservation is released only when the matching
  // chunk reaches the returned stream's consumer.
  const bufferedChunkOrigins: boolean[] = [];
  let boundedSourceCursor = 0;
  let bufferedMergedChunks = 0;
  let completedBoundedReadsSinceYield = 0;
  let boundedReadResumeTimer: ReturnType<typeof setTimeout> | undefined;
  let isCancelled = false;
  let cancelReason: unknown;
  let cancellationPromise: Promise<void> | undefined;
  let outcome: UIMessageStreamOutcome = { status: 'unknown' };

  const stream = new ReadableStream(
    {
      start(controllerArg) {
        controller = controllerArg;
      },
      pull() {
        scheduleBoundedReads();
      },
      cancel(reason) {
        return cancelActiveReaders(reason);
      },
    },
    maxBufferedChunks == null
      ? undefined
      : {
          highWaterMark: maxBufferedChunks,
        },
  );

  function safeEnqueue(
    data: InferUIMessageChunk<UI_MESSAGE>,
    isMergedChunk = false,
  ): boolean {
    if (maxBufferedChunks != null) {
      bufferedChunkOrigins.push(isMergedChunk);
    }

    try {
      controller.enqueue(data);
      return true;
    } catch {
      if (maxBufferedChunks != null) {
        bufferedChunkOrigins.pop();
      }

      // suppress errors when the stream has been closed
      return false;
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

  function cancelActiveReaders(reason: unknown): Promise<void> {
    if (cancellationPromise != null) {
      return cancellationPromise;
    }

    isCancelled = true;
    cancelReason = reason;

    if (boundedReadResumeTimer != null) {
      clearTimeout(boundedReadResumeTimer);
      boundedReadResumeTimer = undefined;
    }

    cancellationPromise = (async () => {
      try {
        await Promise.all(
          Array.from(activeReaders, reader => reader.cancel(reason)),
        );
      } finally {
        for (const source of [...boundedSources]) {
          finishBoundedSource(source);
        }
      }
    })();

    return cancellationPromise;
  }

  function removeBoundedSource(source: BoundedSource) {
    const index = boundedSources.indexOf(source);
    if (index === -1) {
      return;
    }

    boundedSources.splice(index, 1);
    if (index < boundedSourceCursor) {
      boundedSourceCursor--;
    }
    if (boundedSourceCursor >= boundedSources.length) {
      boundedSourceCursor = 0;
    }
  }

  function finishBoundedSource(
    source: BoundedSource,
    failure?: { error: unknown },
  ) {
    if (!source.active) {
      return;
    }

    source.active = false;
    removeBoundedSource(source);

    if (failure == null) {
      source.resolve();
    } else {
      source.reject(failure.error);
    }

    scheduleBoundedReads();
  }

  function getNextBoundedSource(): BoundedSource | undefined {
    for (let i = 0; i < boundedSources.length; i++) {
      if (boundedSourceCursor >= boundedSources.length) {
        boundedSourceCursor = 0;
      }

      const source = boundedSources[boundedSourceCursor];
      boundedSourceCursor++;

      if (source.active && !source.inFlight) {
        return source;
      }
    }

    return undefined;
  }

  function scheduleBoundedReads() {
    if (
      maxBufferedChunks == null ||
      isCancelled ||
      boundedSources.length === 0
    ) {
      return;
    }

    // A synchronous infinite source can otherwise keep a promise microtask
    // chain alive indefinitely while the consumer reads continuously.
    if (completedBoundedReadsSinceYield >= 64) {
      if (boundedReadResumeTimer == null) {
        boundedReadResumeTimer = setTimeout(() => {
          boundedReadResumeTimer = undefined;
          completedBoundedReadsSinceYield = 0;
          scheduleBoundedReads();
        }, 0);
      }
      return;
    }

    const availableSlots = maxBufferedChunks - bufferedMergedChunks;

    for (let i = 0; i < availableSlots; i++) {
      const source = getNextBoundedSource();
      if (source == null) {
        break;
      }

      source.inFlight = true;
      bufferedMergedChunks++;

      void source.reader.read().then(
        ({ done, value }) => {
          source.inFlight = false;

          if (!source.active) {
            bufferedMergedChunks--;
            return;
          }

          if (isCancelled || done) {
            bufferedMergedChunks--;
            finishBoundedSource(source);
            return;
          }

          if (!safeEnqueue(value, true)) {
            bufferedMergedChunks--;
          }
          completedBoundedReadsSinceYield++;
          scheduleBoundedReads();
        },
        error => {
          source.inFlight = false;
          bufferedMergedChunks--;
          finishBoundedSource(source, { error });
        },
      );
    }
  }

  try {
    const result = execute({
      writer: {
        write(part: InferUIMessageChunk<UI_MESSAGE>) {
          safeEnqueue(part);
        },
        merge(streamArg) {
          if (isCancelled) {
            void streamArg.cancel(cancelReason).catch(() => {});
            return;
          }

          ongoingStreamPromises.push(
            (async () => {
              const reader = streamArg.getReader();
              activeReaders.add(reader);

              try {
                if (maxBufferedChunks != null) {
                  let resolve!: () => void;
                  let reject!: (error: unknown) => void;
                  const completion = new Promise<void>(
                    (resolveArg, rejectArg) => {
                      resolve = resolveArg;
                      reject = rejectArg;
                    },
                  );
                  const source: BoundedSource = {
                    reader,
                    inFlight: false,
                    active: true,
                    resolve,
                    reject,
                  };

                  boundedSources.push(source);
                  scheduleBoundedReads();
                  await completion;
                  return;
                }

                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  safeEnqueue(value);
                }
              } finally {
                activeReaders.delete(reader);
                reader.releaseLock();
              }
            })().catch(error => {
              handleError(error);
            }),
          );
        },
        setOutcome,
        onError,
      },
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

  const finishedStream = handleUIMessageStreamFinish<UI_MESSAGE>({
    stream,
    messageId: generateId(),
    originalMessages,
    onStepEnd: onStepEnd ?? onStepFinish,
    onEnd: onEnd ?? onFinish,
    onError,
    getOutcome: () => outcome,
  });

  if (maxBufferedChunks == null) {
    return finishedStream;
  }

  // TransformStream cancellation can be delayed while readable-side chunks
  // are queued. This final demand-driven wrapper makes bounded-mode
  // cancellation immediately visible to every active merged reader.
  const finishedReader = finishedStream.getReader();
  return new ReadableStream(
    {
      async pull(controller) {
        try {
          const { done, value } = await finishedReader.read();
          if (done) {
            controller.close();
          } else {
            const isMergedChunk = bufferedChunkOrigins.shift() ?? false;

            try {
              controller.enqueue(value);
            } finally {
              if (isMergedChunk) {
                bufferedMergedChunks--;
                scheduleBoundedReads();
              }
            }
          }
        } catch (error) {
          controller.error(error);
        }
      },
      async cancel(reason) {
        await Promise.all([
          cancelActiveReaders(reason),
          finishedReader.cancel(reason),
        ]);
      },
    },
    { highWaterMark: 0 },
  );
}
