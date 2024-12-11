import { CoreMessage } from 'ai';

export interface Workflow<CONTEXT = undefined> {
  /**
   * Called when the workflow run is started.
   *
   * @param request - The request object.
   * @param metadata - Additional metadata about the workflow.
   *
   * @returns initial context for the workflow run.
   */
  start(options: {
    request: Request;
    metadata: {
      workflowName: string;
    };
  }): PromiseLike<{
    messages: CoreMessage[];
    context?: CONTEXT;
    initialTask: string;
  }>;

  headers?: Record<string, string>;
}

export function workflow<CONTEXT>(options: Workflow<CONTEXT>) {
  return options;
}
