import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createFx } from './_create';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';
import { run } from '../../lib/run';

const fx = createFx();

run(async () => {
  const sandbox = createVercelSandbox({
    runtime: 'node24',
    ports: [4000],
    timeout: 10 * 60 * 1000,
  });
  const agent = new HarnessAgent({
    harness: fx,
    sandbox,
    instructions:
      'Answer every question in German, even when the user requests another language.',
  });

  const session = await agent.createSession();
  try {
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
    await session.destroy();
  }
});
