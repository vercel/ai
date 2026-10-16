import type { UIMessage } from '../ui/ui-messages';
import type { UIMessageChunk } from './ui-message-chunks';
import {
  createStreamingUIMessageState,
  processUIMessageStream,
  type StreamingUIMessageState,
  type UIMessageStreamWriteOptions,
} from '../ui/process-ui-message-stream';
import {
  createAsyncIterableStream,
  type AsyncIterableStream,
} from '../util/async-iterable-stream';
import { consumeStream } from '../util/consume-stream';

const notPlainJson = Symbol('notPlainJson');

/**
 * Deep-clones plain objects, dense arrays and primitives, which is what UI
 * messages normally contain. This is several times faster than
 * `structuredClone`, which matters because a snapshot is cloned per chunk.
 * Throws `notPlainJson` for any other value (Date, Map, class instance,
 * sparse array, function, ...) so the caller can fall back to
 * `structuredClone` and keep its exact semantics.
 */
function clonePlainValue(value: unknown, seen: Map<object, unknown>): unknown {
  if (typeof value !== 'object' || value === null) {
    if (typeof value === 'function' || typeof value === 'symbol') {
      throw notPlainJson;
    }
    return value;
  }

  const existing = seen.get(value);
  if (existing !== undefined) {
    return existing;
  }

  const prototype = Object.getPrototypeOf(value);

  if (Array.isArray(value)) {
    if (prototype !== Array.prototype) {
      throw notPlainJson;
    }

    const length = value.length;
    const result = new Array(length);
    seen.set(value, result);

    for (let i = 0; i < length; i++) {
      if (!(i in value)) {
        throw notPlainJson;
      }
      result[i] = clonePlainValue(value[i], seen);
    }

    // non-index properties on arrays are preserved by structuredClone
    if (Object.keys(value).length !== length) {
      throw notPlainJson;
    }

    return result;
  }

  if (prototype !== Object.prototype && prototype !== null) {
    throw notPlainJson;
  }

  const result: Record<string, unknown> = {};
  seen.set(value, result);

  for (const key of Object.keys(value)) {
    result[key] = clonePlainValue(
      (value as Record<string, unknown>)[key],
      seen,
    );
  }

  return result;
}

function createUIMessageSnapshotWithStructuredClone<
  UI_MESSAGE extends UIMessage,
>(message: UI_MESSAGE): UI_MESSAGE {
  const textByPartIndex = new Map<number, string>();
  const messageWithoutText = {
    ...message,
    parts: message.parts.map((part, index) => {
      if (part.type === 'text' || part.type === 'reasoning') {
        textByPartIndex.set(index, part.text);
        return { ...part, text: '' };
      }

      return part;
    }),
  };

  const snapshot = structuredClone(messageWithoutText) as UI_MESSAGE;

  for (const [index, text] of textByPartIndex) {
    const part = snapshot.parts[index];

    if (part.type === 'text' || part.type === 'reasoning') {
      part.text = text;
    }
  }

  return snapshot;
}

function createUIMessageSnapshot<UI_MESSAGE extends UIMessage>(
  message: UI_MESSAGE,
): UI_MESSAGE {
  try {
    return clonePlainValue(message, new Map()) as UI_MESSAGE;
  } catch {
    return createUIMessageSnapshotWithStructuredClone(message);
  }
}

/**
 * Transforms a stream of `UIMessageChunk`s into an `AsyncIterableStream` of `UIMessage`s.
 *
 * @param options.message - The last assistant message to use as a starting point when the conversation is resumed. Otherwise undefined.
 * @param options.stream - The stream of `UIMessageChunk`s to read.
 * @param options.terminateOnError - Whether to terminate the stream if an error occurs.
 * @param options.onError - A function that is called when an error occurs.
 *
 * @returns An `AsyncIterableStream` of `UIMessage`s. Each stream part is a different state of the same message
 * as it is being completed.
 */
export function readUIMessageStream<UI_MESSAGE extends UIMessage>({
  message,
  stream,
  onError,
  terminateOnError = false,
}: {
  message?: UI_MESSAGE;
  stream: ReadableStream<UIMessageChunk>;
  onError?: (error: unknown) => void;
  terminateOnError?: boolean;
}): AsyncIterableStream<UI_MESSAGE> {
  let controller: ReadableStreamDefaultController<UI_MESSAGE> | undefined;
  let hasErrored = false;
  let isCancelled = false;
  const abortController = new AbortController();

  const outputStream = new ReadableStream<UI_MESSAGE>({
    start(controllerParam) {
      controller = controllerParam;
    },
    cancel() {
      isCancelled = true;
      abortController.abort();
    },
  });

  const state = createStreamingUIMessageState<UI_MESSAGE>({
    messageId: message?.id ?? '',
    lastMessage: message,
  });

  const handleError = (error: unknown) => {
    onError?.(error);

    if (!hasErrored && terminateOnError) {
      hasErrored = true;
      controller?.error(error);
    }
  };

  consumeStream({
    stream: processUIMessageStream({
      stream,
      resetStateOnMessageIdChange: true,
      runUpdateMessageJob(
        job: (options: {
          state: StreamingUIMessageState<UI_MESSAGE>;
          write: (options?: UIMessageStreamWriteOptions) => void;
        }) => Promise<void>,
      ) {
        return job({
          state,
          write: () => {
            if (!isCancelled) {
              controller?.enqueue(createUIMessageSnapshot(state.message));
            }
          },
        });
      },
      onError: handleError,
    }),
    onError: handleError,
    abortSignal: abortController.signal,
  }).finally(() => {
    // Only close if no error or cancellation occurred. Both erroring and
    // cancelling a stream close its controller.
    if (!hasErrored && !isCancelled) {
      controller?.close();
    }
  });

  return createAsyncIterableStream(outputStream);
}
