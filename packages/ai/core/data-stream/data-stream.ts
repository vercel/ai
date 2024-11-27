import { JSONValue } from '@ai-sdk/provider';

export interface DataStream {
  appendMessageAnnotation(value: JSONValue): void;
  appendData(value: JSONValue): void;
  forward(stream: ReadableStream<string>): void;
}
