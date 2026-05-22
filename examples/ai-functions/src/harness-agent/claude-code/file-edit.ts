import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createClaudeCode } from '@ai-sdk/harness-claude-code';
import { run } from '../../lib/run';
import { createVercelHarnessSandbox } from '../../lib/harness-sandbox';

run(async () => {
  const sandbox = await createVercelHarnessSandbox();
  const agent = new HarnessAgent({
    harness: createClaudeCode(),
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

    const final = await sandbox.readTextFile({ path: 'notes.md' });
    console.log('\nfinal file contents on disk:', final);
  } catch (err) {
    exitCode = 1;
    console.error('[example] failed:', err);
  } finally {
    await agent.close();
    await sandbox.stop();
    process.exit(exitCode);
  }
});
