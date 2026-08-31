import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createGrokBuild } from './_create';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';

const grokBuild = createGrokBuild({
  reasoningEffort: 'high',
});

run(async () => {
  const sandbox = createVercelSandbox({
    runtime: 'node24',
    ports: [4000],
    timeout: 10 * 60 * 1000,
  });
  const agent = new HarnessAgent({
    harness: grokBuild,
    sandbox,
  });

  const session = await agent.createSession();
  try {
    const result = await agent.stream({
      session,
      prompt:
        'Solve this step by step: if f(x) = x^3 - 6x^2 + 11x - 6, find all roots and prove they are correct.',
    });

    let reasoningEmitted = false;
    let reasoningDisplayed = false;
    await printFullStream({
      result,
      onReasoning: reasoning => {
        reasoningEmitted = true;
        reasoningDisplayed ||= reasoning.text.trim() !== '';
      },
    });

    if (!reasoningEmitted) {
      throw new Error('No reasoning emitted');
    }
    if (!reasoningDisplayed) {
      throw new Error('Reasoning emitted, but not displayed');
    }
  } finally {
    await session.destroy();
  }
});
