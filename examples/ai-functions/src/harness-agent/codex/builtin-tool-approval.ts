import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createCodex } from './_create';
import { run } from '../../lib/run';

const codex = createCodex();

run(async () => {
  try {
    new HarnessAgent({
      harness: codex,
      permissionMode: 'allow-edits',
    });
    throw new Error('Expected Codex built-in tool approval to be unsupported.');
  } catch (err) {
    console.log('[example] expected unsupported built-in approval:', err);
  }
});
