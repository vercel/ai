import { HarnessAgent, type HarnessAgentSession } from '@ai-sdk/harness/agent';
import { createVercelNetworkSandboxSession } from '@ai-sdk/sandbox-vercel';
import { createOpenCode } from './_create';
import { captureHarnessStreamStarts } from '../../lib/capture-harness-stream-starts';
import { run } from '../../lib/run';

run(async () => {
  const { harness, streamStarts } = captureHarnessStreamStarts({
    harness: createOpenCode(),
  });
  const agent = new HarnessAgent({ harness });

  const sandboxSession = await createVercelNetworkSandboxSession({
    runtime: 'node24',
    ports: [4000],
    timeout: 10 * 60 * 1000,
    template: await agent.getSandboxTemplate(),
  });
  let session: HarnessAgentSession | undefined;
  try {
    session = await agent.createSession({ sandboxSession });
    const result = await agent.generate({
      session,
      prompt: 'Reply with exactly one word: OK.',
    });
    console.log('text:', result.text);

    const streamStart = streamStarts[0];
    console.log('stream-start:', streamStart);
    if (streamStart?.modelId == null || streamStart.modelId === '') {
      throw new Error('The stream-start part did not include a modelId.');
    }
    console.log('modelId:', streamStart.modelId);
  } finally {
    await session?.destroy();
    await sandboxSession.destroy();
  }
});
