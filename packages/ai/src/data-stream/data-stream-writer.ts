import { DataStreamPart } from './data-stream-parts';

export interface DataStreamWriter {
  /**
   * Appends a data stream part to the stream.
   */
  write(part: DataStreamPart): void;

  /**
   * Merges the contents of another stream to this stream.
   */
  merge(stream: ReadableStream<DataStreamPart>): void;

  /**
   * Error handler that is used by the data stream writer.
   * This is intended for forwarding when merging streams
   * to prevent duplicated error masking.
   */
  onError: ((error: unknown) => string) | undefined;
}
