import { HarnessAgent, type HarnessAgentSession } from '@ai-sdk/harness/agent';
import { createClaudeCode } from './_create';
import { run } from '../../lib/run';
import { createSpritesNetworkSandboxSession } from '@ai-sdk/sandbox-sprites';

const claudeCode = createClaudeCode();

run(async () => {
  const agent = new HarnessAgent({
    harness: claudeCode,
  });

  const sandboxSession = await createSpritesNetworkSandboxSession({
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
