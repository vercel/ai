import { JSONValue } from '@ai-sdk/provider';
import { Source } from '../../core/types/language-model';
import { DataStreamText } from './data-stream-parts';

export interface DataStreamWriter {
  /**
   * Appends a data part to the stream.
   */
  write(data: DataStreamText): void;

  /**
   * Appends a data part to the stream.
   */
  writeData(value: JSONValue): void;

  /**
   * Appends a message annotation to the stream.
   */
  writeMessageAnnotation(value: JSONValue): void;

  /**
   * Appends a source part to the stream.
   */
  writeSource(source: Source): void;

  /**
   * Merges the contents of another stream to this stream.
   */
  merge(stream: ReadableStream<DataStreamText>): void;

  /**
   * Error handler that is used by the data stream writer.
   * This is intended for forwarding when merging streams
   * to prevent duplicated error masking.
   */
  onError: ((error: unknown) => string) | undefined;
}
