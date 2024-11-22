import { JSONValue } from '@ai-sdk/provider';

export interface StreamState<
  CONTEXT extends JSONValue,
  CHUNK extends JSONValue,
> {
  type: 'stream';
  execute(options: { context: CONTEXT }): PromiseLike<{
    context?: PromiseLike<CONTEXT> | CONTEXT;
    stream: ReadableStream<CHUNK>;
    nextState: PromiseLike<string> | string;
  }>;
}
