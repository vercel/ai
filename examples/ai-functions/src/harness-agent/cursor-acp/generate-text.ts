import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';
import { createCursorACP } from './_create';
import { run } from '../../lib/run';

run(async () => {
  const agent = new HarnessAgent({
    harness: createCursorACP(),
    sandbox: createVercelSandbox({
      runtime: 'node24',
      ports: [4000],
      timeout: 10 * 60 * 1000,
    }),
  });
  let session: Awaited<ReturnType<typeof agent.createSession>> | undefined;
  try {
    session = await agent.createSession();
    const result = await agent.generate({
      session,
      prompt: 'In one sentence, what is the capital of France?',
    });
    console.log('text:', result.text);
    console.log('finishReason:', result.finishReason);
    console.log('usage:', result.usage);
  } finally {
    await session?.destroy();
  }
});
