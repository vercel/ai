import { HarnessAgent, type HarnessAgentSession } from '@ai-sdk/harness/agent';
import { createDeepAgents } from './_create';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';
import { createVercelNetworkSandboxSession } from '@ai-sdk/sandbox-vercel';

run(async () => {
  const agent = new HarnessAgent({
    harness: createDeepAgents({
      thinking: {
        type: 'enabled',
        budget_tokens: 4096,
        display: 'summarized',
      },
    }),
  });

  const sandboxSession = await createVercelNetworkSandboxSession({
    runtime: 'node24',
    ports: [4000],
    timeout: 10 * 60 * 1000,
    template: await agent.getSandboxTemplate(),
  });
  let session: HarnessAgentSession | undefined;
  try {
    session = await agent.createSession({ sandboxSession });
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
    await session?.destroy();
    await sandboxSession.destroy();
  }
});
