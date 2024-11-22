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

  // Synchronous on purpose. The next state logic happens
  // after the current state has been executed and should
  // be simple and deterministic (no async calls etc).
  nextState(options: {
    currentState: string;
    context: CONTEXT;
  }): PromiseLike<string>;

  headers?: Record<string, string>;
}
