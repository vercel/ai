import { HarnessAgent, type HarnessAgentSession } from '@ai-sdk/harness/agent';
import { createCodex } from './_create';
import { run } from '../../lib/run';
import { createModalNetworkSandboxSession } from '@ai-sdk/sandbox-modal';

const codex = createCodex();

run(async () => {
  const agent = new HarnessAgent({
    harness: codex,
  });

  const sandboxSession = await createModalNetworkSandboxSession({
    encryptedPorts: [4000],
    timeoutMs: 10 * 60 * 1000,
    template: await agent.getSandboxTemplate(),
  });
  let session: HarnessAgentSession | undefined;
  try {
    session = await agent.createSession({ sandboxSession });
    const result = await agent.generate({
      session,
      prompt: 'In one sentence, what is the capital of France?',
    });
    console.log('text:', result.text);
    console.log('finishReason:', result.finishReason);
    console.log('usage:', result.usage);
  } finally {
    await session?.destroy();
    await sandboxSession.destroy();
  }
});
