import type { UIMessage } from '../ui';
import type { ErrorHandler } from '../util/error-handler';
import type { InferUIMessageChunk } from './ui-message-chunks';
import type { UIMessageStreamOutcome } from './ui-message-stream-outcome';

export interface UIMessageStreamWriter<
  UI_MESSAGE extends UIMessage = UIMessage,
> {
  /**
   * Appends a data stream part to the stream.
   */
  write(part: InferUIMessageChunk<UI_MESSAGE>): void;

  /**
   * Merges the contents of another stream to this stream.
   */
  merge(stream: ReadableStream<InferUIMessageChunk<UI_MESSAGE>>): void;

  /**
   * Error handler that is used by the data stream writer.
   * This is intended for forwarding when merging streams
   * to prevent duplicated error masking.
   */
  onError: ErrorHandler | undefined;
}

export interface UIMessageStreamWriterWithOutcome<
  UI_MESSAGE extends UIMessage = UIMessage,
> extends UIMessageStreamWriter<UI_MESSAGE> {
  /**
   * Declares the operation-level outcome of the composed stream.
   *
   * The first outcome declared through this method is retained. Fatal
   * execution, merge, error-handling, or downstream processing failures
   * override declared outcomes. Declaring an outcome does not write a chunk or
   * close the stream.
   */
  setOutcome(outcome: UIMessageStreamOutcome): void;
}
