import { expect, it } from 'vitest';
import { start } from 'workflow/api';
import { agentDefaultStepLimitE2e } from './test/default-step-limit-workflows.js';

it('stops generate() at the default step limit inside a workflow', async () => {
  const run = await start(agentDefaultStepLimitE2e);

  await expect(run.returnValue).resolves.toBe(20);
  await expect(run.status).resolves.toBe('completed');
});
