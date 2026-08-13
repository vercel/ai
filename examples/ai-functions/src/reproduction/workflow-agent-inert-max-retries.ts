import assert from 'node:assert/strict';
import { MockLanguageModelV4 } from 'ai/test';
import { WorkflowAgent } from '../../../../packages/workflow/dist/index.js';

async function countModelAttempts(maxRetries: number) {
  let attempts = 0;

  const model = new MockLanguageModelV4({
    doStream: async () => {
      attempts++;
      throw new Error('intentional model failure');
    },
  });

  const agent = new WorkflowAgent({
    model,
    maxRetries,
  });

  await assert.rejects(
    agent.stream({
      messages: [{ role: 'user', content: 'trigger the failing model' }],
      writable: new WritableStream(),
    }),
    /intentional model failure/,
  );

  return attempts;
}

async function main() {
  const attemptsWithoutRetries = await countModelAttempts(0);
  const attemptsWithTwoRetries = await countModelAttempts(2);

  assert.equal(
    attemptsWithoutRetries,
    1,
    'maxRetries=0 should make exactly one model attempt',
  );

  assert.equal(
    attemptsWithTwoRetries,
    3,
    `WorkflowAgent maxRetries is inert: maxRetries=0 made ${attemptsWithoutRetries} attempt(s) and maxRetries=2 made ${attemptsWithTwoRetries} attempt(s); expected 3 attempts for maxRetries=2`,
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
