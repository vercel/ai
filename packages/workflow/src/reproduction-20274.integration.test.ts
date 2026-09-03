import { expect, it } from 'vitest';
import { start } from 'workflow/api';
import { reproduceIssue20274Workflow } from './test/reproduction-20274-workflow.js';

it('streams with the workflow runtime AbortSignal', async () => {
  const run = await start(reproduceIssue20274Workflow, []);

  await expect(run.returnValue).resolves.toEqual({
    stepCount: 1,
    lastStepText: 'completed',
  });
});
