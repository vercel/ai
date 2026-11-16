import { describe, expect, test } from 'vitest';
import {
  getDurableHarnessAgentWorkflowName,
  getNonDurableHarnessAgentWorkflowName,
} from './workflow-name';

describe('getDurableHarnessAgentWorkflowName', () => {
  test('names the workflow after the agent id', () => {
    expect(getDurableHarnessAgentWorkflowName({ agentId: 'support' })).toBe(
      'workflow//@ai-sdk/harness//support',
    );
  });
});

describe('getNonDurableHarnessAgentWorkflowName', () => {
  test('names the workflow after the harness id', () => {
    expect(getNonDurableHarnessAgentWorkflowName({ harnessId: 'pi' })).toBe(
      'workflow//@ai-sdk/harness//pi',
    );
  });
});
