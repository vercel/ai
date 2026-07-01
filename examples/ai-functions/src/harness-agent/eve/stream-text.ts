import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createEve } from '@ai-sdk/harness-eve';
import { createJustBashSandbox } from '@ai-sdk/sandbox-just-bash';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';

run(async () => {
  const url = process.env.EVE_BASIC_AGENT_URL;
  if (!url) {
    throw new Error('Set EVE_BASIC_AGENT_URL to a remote Eve agent URL.');
  }

  const agent = new HarnessAgent({
    harness: createEve({ url }),
    sandbox: createJustBashSandbox(), // Ignored by eve harness.
  });

  const session = await agent.createSession();
  try {
    const result = await agent.stream({
      session,
      prompt: 'Recite the first sentence of "A Tale of Two Cities".',
    });

    await printFullStream({ result });

    console.log('finishReason:', await result.finishReason);
    console.log('usage:', await result.usage);
  } finally {
    await session.destroy();
  }
});
