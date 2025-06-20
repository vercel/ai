import { formatDataStreamPart, JSONValue } from '@ai-sdk/ui-utils';
import { DataStreamWriter } from '../core/data-stream/data-stream-writer';
import { createDataStream } from '../core';
import { prepareResponseHeaders } from '../core/util/prepare-response-headers';

type WorkflowEventData<T> = {
  data: T;
};

interface StreamCallbacks {
  /** `onStart`: Called once when the stream is initialized. */
  onStart?: (dataStreamWriter: DataStreamWriter) => Promise<void> | void;

  /** `onFinal`: Called once when the stream is closed with the final completion message. */
  onFinal?: (
    completion: string,
    dataStreamWriter: DataStreamWriter,
  ) => Promise<void> | void;

  /** `onToken`: Called for each tokenized message. */
  onToken?: (
    token: string,
    dataStreamWriter: DataStreamWriter,
  ) => Promise<void> | void;

  /** `onText`: Called for each text chunk. */
  onText?: (
    text: string,
    dataStreamWriter: DataStreamWriter,
  ) => Promise<void> | void;
}

export function toDataStream<TEventData>(
  stream: AsyncIterable<WorkflowEventData<unknown>>,
  callbacks?: StreamCallbacks,
) {
  let completionText = '';
  let hasStarted = false;

  return createDataStream({
    execute: async (dataStreamWriter: DataStreamWriter) => {
      if (!hasStarted && callbacks?.onStart) {
        await callbacks.onStart(dataStreamWriter);
        hasStarted = true;
      }

      for await (const event of stream) {
        const data = event.data;

        if (isTextStream(data)) {
          const content = data.delta;
          if (content) {
            completionText += content;
            dataStreamWriter.write(formatDataStreamPart('text', content));

            if (callbacks?.onText) {
              await callbacks.onText(content, dataStreamWriter);
            }
          }
        } else {
          dataStreamWriter.writeMessageAnnotation(data as JSONValue);
        }
      }

      if (callbacks?.onFinal) {
        await callbacks.onFinal(completionText, dataStreamWriter);
      }
    },
    onError: (error: unknown) => {
      return error instanceof Error
        ? error.message
        : 'An unknown error occurred during stream finalization';
    },
  });
}

export function toDataStreamResponse<TEventData>(
  stream: AsyncIterable<WorkflowEventData<TEventData>>,
  options: {
    init?: ResponseInit;
    callbacks?: StreamCallbacks;
  } = {},
) {
  const { init, callbacks } = options;
  const dataStream = toDataStream(stream, callbacks).pipeThrough(
    new TextEncoderStream(),
  );

  return new Response(dataStream, {
    status: init?.status ?? 200,
    statusText: init?.statusText,
    headers: prepareResponseHeaders(init?.headers, {
      contentType: 'text/plain; charset=utf-8',
      dataStreamVersion: 'v1',
    }),
  });
}

function isTextStream(data: unknown): data is { delta: string } {
  return (
    typeof data === 'object' &&
    data !== null &&
    'delta' in data &&
    typeof (data as any).delta === 'string'
  );
}
