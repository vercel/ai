/**
 * Integration tests for WorkflowAgent workflows.
 *
 * Tests exercise WorkflowAgent through the workflow runtime using mock
 * providers. Tests marked it.fails() correspond to known API gaps.
 *
 * Run with: pnpm test:integration
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { start } from 'workflow/api';

import {
  agentBasicE2e,
  agentErrorToolE2e,
  agentInstructionsStringE2e,
  agentModelRetriesE2e,
  agentMultiStepE2e,
  agentOnFinishE2e,
  agentOnStartE2e,
  agentOnStepFinishE2e,
  agentOnStepStartE2e,
  agentonToolExecutionEndE2e,
  agentonToolExecutionStartE2e,
  agentPrepareCallE2e,
  agentRepairToolCallE2e,
  agentRuntimeAndToolsContextE2e,
  agentSandboxE2e,
  agentSignedToolApprovalIssueE2e,
  agentSignedToolApprovalResumeE2e,
  agentStreamErrorE2e,
  agentTimeoutE2e,
  agentToolApprovalE2e,
  agentToolCallE2e,
  agentToolInputSchemaE2e,
} from './test/agent-e2e-workflows.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

async function collectStream<T>(stream: ReadableStream<T>): Promise<T[]> {
  const chunks: T[] = [];
  const reader = stream.getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        return chunks;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
}

describe('WorkflowAgent integration', { timeout: 120_000 }, () => {
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

    it('retries model calls within one durable step attempt', async () => {
      const run = await start(agentModelRetriesE2e, []);

      await expect(run.returnValue).resolves.toBe(
        'model-attempts=3;step-attempt=1',
      );
    });

    it('surfaces stream error data without retrying the model step', async () => {
      const run = await start(agentStreamErrorE2e, []);
      const chunksPromise = collectStream<{ type: string; error?: unknown }>(
        run.readable,
      );
      const rv = await run.returnValue;
      const chunks = await chunksPromise;
      const terminal = {
        type: 'credential',
        code: 'safe-terminal-classification',
      };

      expect(rv).toEqual({
        error: terminal,
        finishReason: 'error',
        stepCount: 1,
        callbackErrors: [terminal],
      });
      expect(chunks.filter(chunk => chunk.type === 'error')).toEqual([
        { type: 'error', error: terminal },
      ]);
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
  // streamModelCall with serializable tool schemas
  // ==========================================================================

  describe('tool input schema serialization', () => {
    it('tools with zod input schemas work across step boundaries', async () => {
      const run = await start(agentToolInputSchemaE2e, [3, 7]);
      const rv = await run.returnValue;
      expect(rv).toMatchObject({ stepCount: 2 });
      expect(rv.lastStepText).toBe('The sum is 10');
    });
  });

  // ==========================================================================
  // repairToolCall serialization
  // ==========================================================================

  describe('repairToolCall', () => {
    it('callback survives serialization and repairs malformed tool input', async () => {
      const run = await start(agentRepairToolCallE2e, []);
      const rv = await run.returnValue;
      expect(rv).toMatchObject({ stepCount: 2, repaired: true });
      expect(rv.lastStepText).toBe('The sum is 10');
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
  // Lifecycle and approval behavior
  // ==========================================================================

  describe('experimental_onStart', () => {
    it('calls constructor and stream callbacks', async () => {
      const run = await start(agentOnStartE2e, []);
      const rv = await run.returnValue;
      expect(rv.callSources).toEqual(['constructor', 'method']);
    });
  });

  describe('experimental_onStepStart', () => {
    it('calls constructor and stream callbacks', async () => {
      const run = await start(agentOnStepStartE2e, []);
      const rv = await run.returnValue;
      expect(rv.callSources).toEqual(['constructor', 'method']);
    });
  });

  describe('onToolExecutionStart', () => {
    it('calls constructor and stream callbacks', async () => {
      const run = await start(agentonToolExecutionStartE2e, []);
      const rv = await run.returnValue;
      expect(rv.calls).toEqual(['constructor', 'method']);
    });
  });

  describe('onToolExecutionEnd', () => {
    it('calls constructor and stream callbacks with the result', async () => {
      const run = await start(agentonToolExecutionEndE2e, []);
      const rv = await run.returnValue;
      expect(rv.calls).toEqual(['constructor', 'method']);
      expect(rv.capturedEvent).toEqual({
        toolName: 'addNumbers',
        success: true,
        output: 3,
      });
    });
  });

  describe('prepareCall (GAP)', () => {
    it('completes but prepareCall is not applied (GAP)', async () => {
      const run = await start(agentPrepareCallE2e, []);
      const rv = await run.returnValue;
      expect(rv.stepCount).toBe(1);
    });
  });

  describe('tool approval', () => {
    it('pauses before executing a tool that needs approval', async () => {
      const run = await start(agentToolApprovalE2e, []);
      const rv = await run.returnValue;
      expect(rv).toMatchObject({
        stepCount: 1,
        toolCallsCount: 1,
        toolResultsCount: 0,
        firstToolCallName: 'riskyTool',
      });
    });

    it('signs an approval and verifies it in a later workflow run', async () => {
      vi.stubEnv(
        'WORKFLOW_TOOL_APPROVAL_SECRET',
        'workflow-tool-approval-secret-for-tests',
      );
      const issueRun = await start(agentSignedToolApprovalIssueE2e, []);
      const chunksPromise = collectStream<{
        type: string;
        approvalId?: string;
        toolCallId?: string;
        signature?: string;
      }>(issueRun.readable);

      await expect(issueRun.returnValue).resolves.toEqual({
        toolCallsCount: 1,
      });
      const chunks = await chunksPromise;
      const approvalRequest = chunks.find(
        chunk => chunk.type === 'tool-approval-request',
      );

      expect(approvalRequest).toMatchObject({
        approvalId: 'approval-call-1',
        toolCallId: 'call-1',
        signature: expect.any(String),
      });
      expect(JSON.stringify(chunks)).not.toContain(
        'workflow-tool-approval-secret-for-tests',
      );

      const resumeRun = await start(agentSignedToolApprovalResumeE2e, [
        approvalRequest!.signature!,
      ]);

      await expect(resumeRun.returnValue).resolves.toEqual({
        lastStepText: 'approved action done',
        containsApprovedToolResult: true,
      });
    });
  });

  describe('runtimeContext + toolsContext', () => {
    it('flows through prepareStep, tool execute, and onFinish', async () => {
      const run = await start(agentRuntimeAndToolsContextE2e, []);
      const rv = await run.returnValue;

      expect(rv.stepCount).toBe(2);
      expect(rv.lastStepText).toBe('Customer cust_123 is eligible.');

      // Tool received only its own validated context entry, not the
      // full runtimeContext or toolsContext map.
      expect(rv.toolReceivedContext).toEqual({
        apiKey: 'sk-test-key',
        region: 'us',
      });

      // prepareStep updated runtimeContext between steps; onFinish saw it.
      expect(rv.onFinishRuntimeContext).toMatchObject({
        tenantId: 'tenant_123',
        requestId: 'req_abc',
        lastStep: expect.any(Number),
      });
      expect(rv.onFinishToolsContext).toEqual({
        lookupCustomer: { apiKey: 'sk-test-key', region: 'us' },
      });
    });
  });

  describe('experimental_sandbox', () => {
    it('flows through to tool execute', async () => {
      const run = await start(agentSandboxE2e, []);
      const rv = await run.returnValue;

      expect(rv.stepCount).toBe(2);
      expect(rv.lastStepText).toBe('Command executed.');
      expect(rv.constructorSandboxRanCommand).toBe('not-run');
      expect(rv.stepSandboxRanCommand).toBe('echo hello');
      expect(rv.firstPrepareStepSawConstructorSandbox).toBe(true);
      expect(rv.secondPrepareStepSawConstructorSandbox).toBe(true);
      expect(rv.prepareStepSawStepSandbox).toBe(false);
    });
  });
});
