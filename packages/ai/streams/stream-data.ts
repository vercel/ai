import { JSONValue, formatDataStreamPart } from '@ai-sdk/ui-utils';
import { HANGING_STREAM_WARNING_TIME_MS } from '../util/constants';

/**
 * A stream wrapper to send custom JSON-encoded data back to the client.
 *
 * @deprecated Please use `createDataStream`, `createDataStreamResponse`, and `pipeDataStreamToResponse` instead.
 */
export class StreamData {
  private encoder = new TextEncoder();

  private controller: ReadableStreamController<Uint8Array> | null = null;
  public stream: ReadableStream<Uint8Array>;

  private isClosed: boolean = false;
  private warningTimeout: NodeJS.Timeout | null = null;

  constructor() {
    const self = this;

    this.stream = new ReadableStream({
      start: async controller => {
        self.controller = controller;

        // Set a timeout to show a warning if the stream is not closed within 3 seconds
        if (process.env.NODE_ENV === 'development') {
          self.warningTimeout = setTimeout(() => {
            console.warn(
              'The data stream is hanging. Did you forget to close it with `data.close()`?',
            );
          }, HANGING_STREAM_WARNING_TIME_MS);
        }
      },
      pull: controller => {
        // No-op: we don't need to do anything special on pull
      },
      cancel: reason => {
        this.isClosed = true;
      },
    });
  }

  async close(): Promise<void> {
    if (this.isClosed) {
      throw new Error('Data Stream has already been closed.');
    }

    if (!this.controller) {
      throw new Error('Stream controller is not initialized.');
    }

    this.controller.close();
    this.isClosed = true;

    // Clear the warning timeout if the stream is closed
    if (this.warningTimeout) {
      clearTimeout(this.warningTimeout);
    }
  }

  append(value: JSONValue): void {
    if (this.isClosed) {
      throw new Error('Data Stream has already been closed.');
    }

    if (!this.controller) {
      throw new Error('Stream controller is not initialized.');
    }

    this.controller.enqueue(
      this.encoder.encode(formatDataStreamPart('data', [value])),
    );
  }

  appendMessageAnnotation(value: JSONValue): void {
    if (this.isClosed) {
      throw new Error('Data Stream has already been closed.');
    }

    if (!this.controller) {
      throw new Error('Stream controller is not initialized.');
    }

    this.controller.enqueue(
      this.encoder.encode(formatDataStreamPart('message_annotations', [value])),
    );
  }
}
