import { JSONValue } from '@ai-sdk/provider';

export interface Agent<CONTEXT extends JSONValue> {
  init(options: {
    request: Request;
    metadata: {
      agentName: string;
    };
  }): PromiseLike<{
    context: CONTEXT;
  }>;
}
