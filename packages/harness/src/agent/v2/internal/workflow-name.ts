/**
 * Prefix of the `workflowName` of every HarnessAgent run, durable or not.
 */
export const HARNESS_AGENT_WORKFLOW_NAME_PREFIX = 'workflow//@ai-sdk/harness//';

/**
 * The `workflowName` the runs of a durable agent record: named after the
 * agent's `id`, so that the World's recovery of active runs builds the
 * agent's queue name from it.
 */
export function getDurableHarnessAgentWorkflowName(options: {
  agentId: string;
}): `workflow//@ai-sdk/harness//${string}` {
  return `${HARNESS_AGENT_WORKFLOW_NAME_PREFIX}${options.agentId}`;
}

/**
 * The `workflowName` the runs of an agent that is not durable record: named
 * after the agent's harness.
 */
export function getNonDurableHarnessAgentWorkflowName(options: {
  harnessId: string;
}): `workflow//@ai-sdk/harness//${string}` {
  return `${HARNESS_AGENT_WORKFLOW_NAME_PREFIX}${options.harnessId}`;
}
