import { JSONValue } from '@ai-sdk/provider';
import { DataStreamString } from '@ai-sdk/ui-utils';

/**
 * Basic version of DataStreamWriter that exposes only the high-level writing methods.
 * Used for client-side and tool execution where only data and annotation writing is needed.
 */
export interface BasicDataStreamWriter {
  /**
   * Appends a data part to the stream.
   */
  writeData(value: JSONValue): void;

  /**
   * Appends a message annotation to the stream.
   */
  writeMessageAnnotation(value: JSONValue): void;
}

/**
 * Full version of DataStreamWriter that includes all stream manipulation methods.
 * Used internally for stream processing and merging.
 */
export interface DataStreamWriter extends BasicDataStreamWriter {
  /**
   * Appends a data part to the stream.
   */
  write(data: DataStreamString): void;

  /**
   * Merges the contents of another stream to this stream.
   */
  merge(stream: ReadableStream<DataStreamString>): void;

  /**
   * Error handler that is used by the data stream writer.
   * This is intended for forwarding when merging streams
   * to prevent duplicated error masking.
   */
  onError: ((error: unknown) => string) | undefined;
}
