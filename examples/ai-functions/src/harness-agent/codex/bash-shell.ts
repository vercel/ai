import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createCodex } from '@ai-sdk/harness-codex';
import { run } from '../../lib/run';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';

run(async () => {
  const sandbox = createVercelSandbox({
    runtime: 'node24',
    ports: [4000],
    timeout: 10 * 60 * 1000,
  });
  const agent = new HarnessAgent({
    harness: createCodex(),
    sandbox,
  });

  let exitCode = 0;
  try {
    const result = await agent.stream({
      prompt: 'Run `uname -a` and tell me what kernel this sandbox is running.',
    });

    for await (const part of result.fullStream) {
      if (part.type === 'text-delta') {
        process.stdout.write(part.text);
      } else if (part.type === 'tool-call') {
        console.log('\n[tool-call]', part.toolName, part.input);
      } else if (part.type === 'tool-result') {
        console.log('[tool-result]', part.toolName, part.output);
      }
    }
    console.log();
  } catch (err) {
    exitCode = 1;
    console.error('[example] failed:', err);
  } finally {
    await agent.close();
    process.exit(exitCode);
  }
});
