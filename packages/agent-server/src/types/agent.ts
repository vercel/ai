import { JSONValue } from '@ai-sdk/provider';

export interface Agent<CONTEXT extends JSONValue> {
  start(options: {
    request: Request;
    metadata: {
      agentName: string;
    };
  }): PromiseLike<{
    context: CONTEXT;
  }>;

  routeStep(options: { context: CONTEXT }): PromiseLike<string>;
}
