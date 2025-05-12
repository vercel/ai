import { UIMessageStreamPart } from './ui-message-stream-parts';

export interface UIMessageStreamWriter {
  /**
   * Appends a data stream part to the stream.
   */
  write(part: UIMessageStreamPart): void;

  /**
   * Merges the contents of another stream to this stream.
   */
  merge(stream: ReadableStream<UIMessageStreamPart>): void;

  /**
   * Error handler that is used by the data stream writer.
   * This is intended for forwarding when merging streams
   * to prevent duplicated error masking.
   */
  onError: ((error: unknown) => string) | undefined;
}
