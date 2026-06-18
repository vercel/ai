import { HarnessAgent } from '@ai-sdk/harness/agent';
import { grokBuild } from '@ai-sdk/harness-grok-build';
import { createJustBashSandbox } from '@ai-sdk/sandbox-just-bash';
import { run } from '../../lib/run';

// Local end-to-end smoke test. Uses the just-bash sandbox so it runs on the
// host (no remote sandbox). Requires XAI_API_KEY (or AI Gateway env) in
// examples/ai-functions/.env. The bootstrap installs the `grok` CLI under
// /tmp/harness/grok-build and the bridge drives it in streaming-json mode.
run(async () => {
  const agent = new HarnessAgent({
    harness: grokBuild,
    sandbox: createJustBashSandbox(),
  });

  let exitCode = 0;
  const session = await agent.createSession();
  try {
    const result = await agent.generate({
      session,
      prompt: 'In one sentence, what is the capital of France?',
    });
    console.log('text:', result.text);
    console.log('finishReason:', result.finishReason);
    console.log('usage:', result.usage);
  } catch (err) {
    exitCode = 1;
    console.error('[example] failed:', err);
  } finally {
    await session.destroy();
    process.exit(exitCode);
  }
});
