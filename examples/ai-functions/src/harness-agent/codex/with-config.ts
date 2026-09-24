import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';
import { run } from '../../lib/run';
import { createCodex } from './_create';

const marker = 'CODEX_CONFIG_APPLIED';

run(async () => {
  const agent = new HarnessAgent({
    harness: createCodex({
      codexConfig: {
        instructions: `Include ${marker} in every response.`,
        model_verbosity: 'low',
      },
    }),
    sandbox: createVercelSandbox({
      runtime: 'node24',
      ports: [4000],
      timeout: 10 * 60 * 1000,
    }),
  });

  const session = await agent.createSession();
  try {
    const result = await agent.generate({
      session,
      prompt: 'In one sentence, what is the capital of France?',
    });
    console.log('text:', result.text);
    console.log('finishReason:', result.finishReason);
    console.log('usage:', result.usage);

    if (!result.text.includes(marker)) {
      throw new Error('Codex did not apply the native configuration.');
    }
  } finally {
    await session.destroy();
  }
});
