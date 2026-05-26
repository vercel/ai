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
    harness: createCodex({ webSearch: true }),
    sandbox,
  });

  let exitCode = 0;
  try {
    const result = await agent.stream({
      prompt:
        'Search the web for the latest version of Node.js and report it back.',
    });

    for await (const part of result.fullStream) {
      if (part.type === 'text-delta') {
        process.stdout.write(part.text);
      } else if (part.type === 'tool-call' && part.toolName === 'webSearch') {
        console.log('\n[webSearch]', part.input);
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
