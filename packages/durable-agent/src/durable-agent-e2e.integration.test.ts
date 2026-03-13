/**
 * Integration tests for DurableAgent workflows.
 *
 * Tests exercise DurableAgent through the workflow runtime using mock
 * providers. Tests marked it.fails() correspond to known API gaps.
 *
 * Run with: pnpm test:integration
 */
import { describe, expect, it } from 'vitest';
import { start } from 'workflow/api';

import {
  agentBasicE2e,
  agentErrorToolE2e,
  agentInstructionsStringE2e,
  agentMultiStepE2e,
  agentOnFinishE2e,
  agentOnStartE2e,
  agentOnStepFinishE2e,
  agentOnStepStartE2e,
  agentOnToolCallFinishE2e,
  agentOnToolCallStartE2e,
  agentPrepareCallE2e,
  agentTimeoutE2e,
  agentToolApprovalE2e,
  agentToolCallE2e,
} from './test/agent-e2e-workflows.js';

describe('DurableAgent integration', { timeout: 120_000 }, () => {
  // ==========================================================================
  // Core agent tests
  // ==========================================================================

  describe('core', () => {
    it('basic text response', async () => {
      const run = await start(agentBasicE2e, ['hello world']);
      const rv = await run.returnValue;
      expect(rv).toMatchObject({
        stepCount: 1,
        lastStepText: 'Echo: hello world',
      });
    });

    it('single tool call', async () => {
      const run = await start(agentToolCallE2e, [3, 7]);
      const rv = await run.returnValue;
      expect(rv).toMatchObject({ stepCount: 2 });
      expect(rv.lastStepText).toBe('The sum is 10');
    });

    it('multiple sequential tool calls', async () => {
      const run = await start(agentMultiStepE2e, []);
      const rv = await run.returnValue;
      expect(rv).toMatchObject({
        stepCount: 4,
        lastStepText: 'All done!',
      });
    });

    it('tool error recovery', async () => {
      const run = await start(agentErrorToolE2e, []);
      const rv = await run.returnValue;
      expect(rv).toMatchObject({
        stepCount: 2,
        lastStepText: 'Tool failed but I recovered.',
      });
    });
  });

  // ==========================================================================
  // onStepFinish callback tests
  // ==========================================================================

  describe('onStepFinish', () => {
    it('fires constructor + stream callbacks in order with step data', async () => {
      const run = await start(agentOnStepFinishE2e, []);
      const rv = await run.returnValue;

      expect(rv.callSources).toEqual(['constructor', 'method']);

      expect(rv.capturedStepResult).toMatchObject({
        text: 'hello',
        finishReason: 'stop',
      });

      expect(rv.stepCount).toBe(1);
    });
  });

  // ==========================================================================
  // onFinish callback tests
  // ==========================================================================

  describe('onFinish', () => {
    it('fires constructor + stream callbacks in order with event data', async () => {
      const run = await start(agentOnFinishE2e, []);
      const rv = await run.returnValue;

      expect(rv.callSources).toEqual(['constructor', 'method']);

      expect(rv.capturedEvent).toMatchObject({
        text: 'hello from finish',
        finishReason: 'stop',
        stepsLength: 1,
        hasMessages: true,
        hasTotalUsage: true,
      });
    });
  });

  // ==========================================================================
  // Instructions test
  // ==========================================================================

  describe('instructions', () => {
    it('string instructions are passed to the model', async () => {
      const run = await start(agentInstructionsStringE2e, []);
      const rv = await run.returnValue;
      expect(rv.stepCount).toBe(1);
      expect(rv.lastStepText).toBe('ok');
    });
  });

  // ==========================================================================
  // Timeout test
  // ==========================================================================

  describe('timeout', () => {
    it('completes within timeout', async () => {
      const run = await start(agentTimeoutE2e, []);
      const rv = await run.returnValue;
      expect(rv).toMatchObject({
        stepCount: 1,
        lastStepText: 'fast response',
      });
    });
  });

  // ==========================================================================
  // GAP tests — these fail until the feature is implemented
  // ==========================================================================

  describe('experimental_onStart (GAP)', () => {
    it('completes but callbacks are not called (GAP)', async () => {
      const run = await start(agentOnStartE2e, []);
      const rv = await run.returnValue;
      // GAP: when implemented, should be ['constructor', 'method']
      expect(rv.callSources).toEqual([]);
    });
  });

  describe('experimental_onStepStart (GAP)', () => {
    it('completes but callbacks are not called (GAP)', async () => {
      const run = await start(agentOnStepStartE2e, []);
      const rv = await run.returnValue;
      // GAP: when implemented, should be ['constructor', 'method']
      expect(rv.callSources).toEqual([]);
    });
  });

  describe('experimental_onToolCallStart (GAP)', () => {
    it('completes but callbacks are not called (GAP)', async () => {
      const run = await start(agentOnToolCallStartE2e, []);
      const rv = await run.returnValue;
      // GAP: when implemented, should be ['constructor', 'method']
      expect(rv.calls).toEqual([]);
    });
  });

  describe('experimental_onToolCallFinish (GAP)', () => {
    it('completes but callbacks are not called (GAP)', async () => {
      const run = await start(agentOnToolCallFinishE2e, []);
      const rv = await run.returnValue;
      // GAP: when implemented, should be ['constructor', 'method']
      expect(rv.calls).toEqual([]);
      // GAP: capturedEvent should have tool result data
      expect(rv.capturedEvent).toBeNull();
    });
  });

  describe('prepareCall (GAP)', () => {
    it('completes but prepareCall is not applied (GAP)', async () => {
      const run = await start(agentPrepareCallE2e, []);
      const rv = await run.returnValue;
      expect(rv.stepCount).toBe(1);
    });
  });

  describe('tool approval (GAP)', () => {
    it('completes but needsApproval is not checked (GAP)', async () => {
      const run = await start(agentToolApprovalE2e, []);
      const rv = await run.returnValue;
      // GAP: when tool approval is implemented, the agent should pause
      // with toolCallsCount=1 and toolResultsCount=0 (awaiting approval).
      // Currently needsApproval is ignored, so the tool executes immediately.
      expect(rv.stepCount).toBe(2);
    });
  });
});
