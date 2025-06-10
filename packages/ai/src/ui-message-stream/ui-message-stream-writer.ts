import { UIMessage } from '../ui';
import { InferUIMessageStreamPart } from './ui-message-stream-parts';

export interface UIMessageStreamWriter<
  UI_MESSAGE extends UIMessage = UIMessage,
> {
  /**
   * Appends a data stream part to the stream.
   */
  write(part: InferUIMessageStreamPart<UI_MESSAGE>): void;

  /**
   * Merges the contents of another stream to this stream.
   */
  merge(stream: ReadableStream<InferUIMessageStreamPart<UI_MESSAGE>>): void;

  /**
   * Error handler that is used by the data stream writer.
   * This is intended for forwarding when merging streams
   * to prevent duplicated error masking.
   */
  onError: ((error: unknown) => string) | undefined;
}
