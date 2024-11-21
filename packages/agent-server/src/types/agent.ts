import { JSONValue } from '@ai-sdk/provider';

export interface Agent<CONTEXT extends JSONValue> {
  /**
   * Called when the agent run is started.
   *
   * @param request - The request object.
   * @param metadata - Additional metadata about the agent.
   *
   * @returns initial context for the agent run.
   */
  start(options: {
    request: Request;
    metadata: {
      agentName: string;
    };
  }): PromiseLike<{
    context: CONTEXT;
  }>;

  nextState(options: {
    currentState: string;
    context: CONTEXT;
  }): PromiseLike<string>;
}
