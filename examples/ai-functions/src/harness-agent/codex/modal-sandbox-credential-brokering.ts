import { HarnessAgent, type HarnessAgentSession } from '@ai-sdk/harness/agent';
import { createCodex } from './_create';
import { run } from '../../lib/run';
import { createModalNetworkSandboxSession } from '@ai-sdk/sandbox-modal';

const codex = createCodex();

run(async () => {
  const agent = new HarnessAgent({
    harness: codex,
  });

  /*
   * `requestTransformations` lets the harness broker the model credential:
   * the sandbox only receives a placeholder, and Modal attaches the real
   * credential to requests to the model host after they leave the sandbox.
   */
  const sandboxSession = await createModalNetworkSandboxSession({
    encryptedPorts: [4000],
    timeoutMs: 10 * 60 * 1000,
    requestTransformations: true,
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
