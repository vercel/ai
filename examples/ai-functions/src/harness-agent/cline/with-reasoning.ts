import { HarnessAgent, type HarnessAgentSession } from '@ai-sdk/harness/agent';
import { createCline } from './_create';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';
import { createVercelNetworkSandboxSession } from '@ai-sdk/sandbox-vercel';

run(async () => {
  const agent = new HarnessAgent({
    harness: createCline({
      reasoningEffort: 'high',
    }),
    // This Gemini model is more likely than others to actually emit reasoning,
    // that's why it's here. Simply allows more reliably verifying whether
    // reasoning technically works correctly or not.
    model: 'google/gemini-3.1-pro-preview',
  });

  let exitCode = 0;
  const sandboxSession = await createVercelNetworkSandboxSession({
    runtime: 'node24',
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
  } catch (err) {
    exitCode = 1;
    console.error('[example] failed:', err);
  } finally {
    await session?.destroy();
    await sandboxSession.destroy();
    process.exit(exitCode);
  }
});
