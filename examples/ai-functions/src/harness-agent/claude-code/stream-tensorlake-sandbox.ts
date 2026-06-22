import { HarnessAgent } from '@ai-sdk/harness/agent';
import { claudeCode } from '@ai-sdk/harness-claude-code';
import { createTensorlakeSandbox } from '@ai-sdk/sandbox-tensorlake';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';

run(async () => {
  // Requires TENSORLAKE_API_KEY (sandbox) and a Claude credential
  // (ANTHROPIC_API_KEY or AI_GATEWAY_API_KEY) in the environment.
  //
  // The Claude Code harness bootstraps itself inside the sandbox with
  // `pnpm install`, but Tensorlake's default image does not ship `pnpm`. Rather
  // than build a custom image, install it at runtime via `setup`: the commands
  // run as root once after the sandbox is created, so `pnpm` lands in /usr/bin
  // where the non-root run user can execute it.
  const sandbox = createTensorlakeSandbox({
    setup: ['npm install -g pnpm@10'],
    cpus: 2,
    memoryMb: 4096,
    timeoutSecs: 10 * 60,
  });
  const agent = new HarnessAgent({
    harness: claudeCode,
    sandbox,
  });

  let exitCode = 0;
  const session = await agent.createSession();
  try {
    const result = await agent.stream({
      session,
      prompt: 'Recite the first sentence of "A Tale of Two Cities".',
    });

    await printFullStream({ result });

    console.log('finishReason:', await result.finishReason);
    console.log('usage:', await result.usage);
  } catch (err) {
    exitCode = 1;
    console.error('[example] failed:', err);
  } finally {
    await session.destroy();
    process.exit(exitCode);
  }
});
