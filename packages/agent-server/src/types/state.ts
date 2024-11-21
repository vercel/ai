import { JSONValue } from '@ai-sdk/provider';

export interface State<CONTEXT extends JSONValue> {
  execute(options: { context: CONTEXT }): PromiseLike<void>;
}
