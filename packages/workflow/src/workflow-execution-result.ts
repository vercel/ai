import type { ToolSet } from 'ai';
import type { WorkflowAgentStreamResult } from './workflow-agent.js';

/** Reconstructed workflow data, never the payload of a durable model step. */
export type WorkflowExecutionData<TOOLS extends ToolSet, OUTPUT> = Omit<
  WorkflowAgentStreamResult<TOOLS, OUTPUT>,
  'error'
>;

/**
 * Presence is explicit so even `throw undefined` remains a failure. Stream
 * errors resolve with data, while execution errors reject; generation can
 * interpret the same outcomes without duplicating orchestration.
 */
export type WorkflowExecutionOutcome =
  | { status: 'completed' }
  | { status: 'aborted'; rejection?: { value: unknown } }
  | {
      status: 'failed';
      source: 'model-stream' | 'execution';
      error: unknown;
    };

export interface WorkflowExecutionResult<TOOLS extends ToolSet, OUTPUT> {
  data: WorkflowExecutionData<TOOLS, OUTPUT>;
  outcome: WorkflowExecutionOutcome;
}

export function resolveWorkflowStreamResult<TOOLS extends ToolSet, OUTPUT>({
  data,
  outcome,
}: WorkflowExecutionResult<TOOLS, OUTPUT>): WorkflowAgentStreamResult<
  TOOLS,
  OUTPUT
> {
  if (outcome.status === 'failed') {
    if (outcome.source === 'execution') {
      throw outcome.error;
    }
    return { ...data, error: outcome.error };
  }

  if (outcome.status === 'aborted' && outcome.rejection != null) {
    throw outcome.rejection.value;
  }

  return data;
}
