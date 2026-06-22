import { HarnessAgent } from '@ai-sdk/harness/agent';
import { claudeCode } from '@ai-sdk/harness-claude-code';
import { createTensorlakeSandbox } from '@ai-sdk/sandbox-tensorlake';
import { run } from '../../lib/run';

// A minimal, non-streaming Claude Code + Tensorlake sandbox demo.
//
// Requires in the environment (or examples/ai-functions/.env):
//   TENSORLAKE_API_KEY      — Tensorlake sandbox credential
//   ANTHROPIC_API_KEY       — (or AI_GATEWAY_API_KEY) Claude credential
//
// No custom image needed: the Claude Code harness bootstraps with `pnpm`, which
// the default Tensorlake image lacks, so we install it via the `setup` option.
// Setup commands run as root once after the sandbox is created, landing `pnpm`
// in /usr/bin where the non-root run user can execute it.
run(async () => {
  const agent = new HarnessAgent({
    harness: claudeCode,
    sandbox: createTensorlakeSandbox({
      setup: ['npm install -g pnpm@10'],
      cpus: 2,
      memoryMb: 4096,
    }),
  });

  const session = await agent.createSession();
  try {
    const { text } = await agent.generate({
      session,
      prompt:
        'Write bubble-sort.js that sorts [5, 2, 9, 1, 7] and prints the result, then run it.',
    });
    console.log(text);
  } finally {
    await session.destroy();
  }
});
