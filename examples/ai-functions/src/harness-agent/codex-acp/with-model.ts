import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';
import { createCodexACP } from './_create';
import { run } from '../../lib/run';

run(async () => {
  const agent = new HarnessAgent({
    harness: createCodexACP(),
    model: 'gpt-5.6-luna',
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
      prompt:
        'What AI model are you running right now? Who is responding to me here?',
    });
    console.log(result.text);
  } finally {
    await session.destroy();
  }
});
