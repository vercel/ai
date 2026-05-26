import { HarnessAgent } from '@ai-sdk/harness/agent';
import { claudeCode } from '@ai-sdk/harness-claude-code';
import { run } from '../../lib/run';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';

run(async () => {
  const sandbox = createVercelSandbox({
    runtime: 'node24',
    ports: [4000],
    timeout: 10 * 60 * 1000,
  });
  const agent = new HarnessAgent({
    harness: claudeCode,
    sandbox,
  });

  let exitCode = 0;
  try {
    const result = await agent.generate({
      prompt:
        'Create a file at `notes.md` containing the text "hello world", then edit it to replace ' +
        '"hello" with "Hello" (capitalized), then read it back and print its contents in your reply.',
    });
    console.log('text:', result.text);
  } catch (err) {
    exitCode = 1;
    console.error('[example] failed:', err);
  } finally {
    await agent.close();
    process.exit(exitCode);
  }
});
