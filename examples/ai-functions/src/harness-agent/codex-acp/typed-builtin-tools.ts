import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';
import { createCodexACP } from '../../lib/codex-acp-harness';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';

/*
 * The profile declares Codex's shell as the common typed `bash` builtin.
 * codex-acp 1.1.4 currently omits ACP's draft programmatic tool name, so its
 * live call intentionally exercises the provider-executed dynamic fallback.
 * The static branch activates only when an ACP runtime supplies exact `shell`.
 */
run(async () => {
  const harness = createCodexACP();
  const nativeName: string | undefined = harness.builtinTools.bash.nativeName;
  console.log('configured shell nativeName:', nativeName);

  const agent = new HarnessAgent({
    harness,
    sandbox: createVercelSandbox({
      runtime: 'node24',
      ports: [4000],
      timeout: 10 * 60 * 1000,
    }),
  });
  const session = await agent.createSession();
  try {
    const result = await agent.stream({
      session,
      prompt: 'Run `printf typed-acp` in the shell and report the output.',
    });
    await printFullStream({ result });
  } finally {
    await session.destroy();
  }
});
