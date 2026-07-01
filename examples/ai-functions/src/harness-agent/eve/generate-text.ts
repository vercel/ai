import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createEve } from '@ai-sdk/harness-eve';
import { createJustBashSandbox } from '@ai-sdk/sandbox-just-bash';
import { run } from '../../lib/run';

run(async () => {
  const url = process.env.EVE_AGENT_URL;
  if (!url) {
    throw new Error('Set EVE_AGENT_URL to a remote Eve agent URL.');
  }

  const agent = new HarnessAgent({
    harness: createEve({ url }),
    sandbox: createJustBashSandbox(),
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
  } finally {
    await session.destroy();
  }
});
