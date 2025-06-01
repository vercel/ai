import { UIMessageStreamPart } from './ui-message-stream-parts';
import { UIDataTypes } from '../ui';

export interface UIMessageStreamWriter<
  DATA_TYPES extends UIDataTypes = UIDataTypes,
> {
  /**
   * Appends a data stream part to the stream.
   */
  write(part: UIMessageStreamPart<DATA_TYPES>): void;

  /**
   * Merges the contents of another stream to this stream.
   */
  merge(stream: ReadableStream<UIMessageStreamPart<DATA_TYPES>>): void;

  /**
   * Error handler that is used by the data stream writer.
   * This is intended for forwarding when merging streams
   * to prevent duplicated error masking.
   */
  onError: ((error: unknown) => string) | undefined;
}
