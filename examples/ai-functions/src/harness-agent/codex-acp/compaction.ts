import {
  HarnessAgent,
  HarnessCapabilityUnsupportedError,
  type HarnessAgentSession,
} from '@ai-sdk/harness/agent';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';
import { createCodexACP } from '../../lib/codex-acp-harness';
import { run } from '../../lib/run';

run(async () => {
  const agent = new HarnessAgent({
    harness: createCodexACP(),
    sandbox: createVercelSandbox({
      runtime: 'node24',
      ports: [4000],
      timeout: 10 * 60 * 1000,
    }),
  });

  let session: HarnessAgentSession | undefined;
  try {
    session = await agent.createSession();
    await agent.generate({
      session,
      prompt: 'Reply with exactly ready.',
    });
    try {
      await session.compact();
      throw new Error(
        'Standard ACP v1 unexpectedly supported manual compaction.',
      );
    } catch (error) {
      if (!HarnessCapabilityUnsupportedError.isInstance(error)) {
        throw error;
      }
      console.log(error.message);
    }
  } finally {
    await session?.destroy();
  }
});
