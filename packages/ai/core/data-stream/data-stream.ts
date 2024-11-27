import { JSONValue } from '@ai-sdk/provider';

export interface DataStream {
  /**
   * Appends a data part to the stream.
   */
  appendData(value: JSONValue): void;

  /**
   * Appends a message annotation to the stream.
   */
  appendMessageAnnotation(value: JSONValue): void;

  /**
   * Forwards the contents of another stream to this stream.
   */
  forward(stream: ReadableStream<string>): void;
}
