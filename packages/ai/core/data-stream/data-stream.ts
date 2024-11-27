import { JSONValue } from '@ai-sdk/provider';

export interface DataStream {
  /**
   * Appends a data part to the stream.
   */
  writeData(value: JSONValue): void;

  /**
   * Appends a message annotation to the stream.
   */
  writeMessageAnnotation(value: JSONValue): void;

  /**
   * Merges the contents of another stream to this stream.
   */
  // TODO limit to data stream parts
  merge(stream: ReadableStream<string>): void;
}
