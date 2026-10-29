import { HarnessAgent, type HarnessAgentSession } from '@ai-sdk/harness/agent';
import { createPi } from './_create';
import { createVercelNetworkSandboxSession } from '@ai-sdk/sandbox-vercel';
import { run } from '../../lib/run';

const pi = createPi();

run(async () => {
  const agent = new HarnessAgent({
    harness: pi,
    instructions:
      'Answer every question in German, even when the user requests another language.',
  });

  const sandboxSession = await createVercelNetworkSandboxSession({
    runtime: 'node24',
    timeout: 10 * 60 * 1000,
    template: await agent.getSandboxTemplate(),
  });
  let session: HarnessAgentSession | undefined;
  try {
    session = await agent.createSession({ sandboxSession });
    const first = await agent.generate({
      session,
      prompt: 'In one sentence, what is the capital of France?',
    });
    console.log('first text:', first.text);

    const second = await agent.generate({
      session,
      prompt: 'Now answer in English: What is the capital of Germany?',
    });
    console.log('second text:', second.text);
    console.log('finishReason:', second.finishReason);
    console.log('usage:', second.usage);

    if (!/\bist\b/i.test(second.text)) {
      throw new Error('Reply is not in German, violating the system prompt');
    }
  } finally {
    await session?.destroy();
    await sandboxSession.destroy();
  }
});
