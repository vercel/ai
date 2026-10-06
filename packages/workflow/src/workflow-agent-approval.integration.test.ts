import { waitForHook } from '@workflow/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resumeHook, start } from 'workflow/api';
import {
  hydrateResourceIO,
  observabilityRevivers,
} from 'workflow/observability';
import { getWorld } from 'workflow/runtime';
import {
  generateWithSuspendingTool,
  issueGenerateApproval,
  resumeGenerateApproval,
} from './test/approval-workflows.js';

const secret = 'phase4-runtime-secret-not-for-workflow-history';
async function steps(runId: string) {
  const page = await (
    await getWorld()
  ).steps.list({ runId, resolveData: 'all' });
  expect(page.hasMore).toBe(false);
  return page.data.map(step => hydrateResourceIO(step, observabilityRevivers));
}
afterEach(() => vi.unstubAllEnvs());

describe('durable generate approvals', () => {
  it.each([true, false])(
    'round trips signed approval data without a writable (%s)',
    async approved => {
      vi.stubEnv('WORKFLOW_TOOL_APPROVAL_SECRET', secret);
      const issueRun = await start(issueGenerateApproval, []);
      const messages = await issueRun.returnValue;
      expect(messages).toMatchObject([
        {
          role: 'assistant',
          content: [
            expect.objectContaining({ type: 'tool-call' }),
            expect.objectContaining({
              type: 'tool-approval-request',
              signature: expect.any(String),
            }),
          ],
        },
      ]);
      const issuedSteps = await steps(issueRun.runId);
      const signingStep = issuedSteps.find(step =>
        step.stepName.includes('signWorkflowToolApproval'),
      );
      expect(signingStep?.input).toEqual({
        args: [
          {
            secret: { environmentVariable: 'WORKFLOW_TOOL_APPROVAL_SECRET' },
            approvalId: 'approval-call-1',
            toolCallId: 'call-1',
            toolName: 'action',
            input: { value: 'approved-action' },
          },
        ],
        closureVars: undefined,
        thisVal: undefined,
      });
      expect(JSON.stringify(issuedSteps)).not.toContain(secret);
      expect(JSON.stringify(messages)).not.toContain(secret);

      const resumeRun = await start(resumeGenerateApproval, [
        messages,
        approved,
      ]);
      const result = await resumeRun.returnValue;
      expect(result.text).toBe('Finished.');
      expect(JSON.stringify(result.responseMessages)).toContain(
        approved ? 'performed:approved-action' : 'execution-denied',
      );
      const resumedSteps = await steps(resumeRun.runId);
      expect(JSON.stringify(resumedSteps)).not.toContain(secret);
      const verificationStep = resumedSteps.find(step =>
        step.stepName.includes('verifyWorkflowToolApprovalSignature'),
      );
      if (approved) {
        expect(verificationStep?.input).toMatchObject({
          args: [
            {
              secret: { environmentVariable: 'WORKFLOW_TOOL_APPROVAL_SECRET' },
            },
          ],
        });
        expect(
          resumedSteps.some(step =>
            step.stepName.includes('performApprovedAction'),
          ),
        ).toBe(true);
      } else
        expect(
          resumedSteps.some(step =>
            step.stepName.includes('performApprovedAction'),
          ),
        ).toBe(false);
    },
  );

  it('resumes a hook tool while retaining completed model and tool steps', async () => {
    const run = await start(generateWithSuspendingTool, []);
    const hook = await waitForHook(run);
    const before = (await steps(run.runId)).filter(
      step => step.status === 'completed',
    );
    expect(
      before.filter(step => step.stepName.includes('doGenerateStep')),
    ).toHaveLength(2);
    expect(
      before.filter(step => step.stepName.includes('completedWork')),
    ).toHaveLength(1);
    await resumeHook(hook.token, 'resumed input');
    await expect(run.returnValue).resolves.toEqual({
      text: 'Resumed.',
      outputs: ['completed before suspension', 'resumed input'],
    });
    const after = await steps(run.runId);
    expect(
      after.filter(step => step.stepName.includes('doGenerateStep')),
    ).toHaveLength(3);
    for (const completed of before)
      expect(after.find(step => step.stepId === completed.stepId)).toEqual(
        completed,
      );
  });
});
