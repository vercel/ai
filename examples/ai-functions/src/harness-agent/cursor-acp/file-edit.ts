import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';
import { createCursorACP } from './_create';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';

run(async () => {
  const agent = new HarnessAgent({
    harness: createCursorACP(),
    sandbox: createVercelSandbox({
      runtime: 'node24',
      ports: [4000],
      timeout: 10 * 60 * 1000,
    }),
  });
  const session = await agent.createSession();
  try {
    const createResult = await agent.stream({
      session,
      prompt:
        'Create `notes.md` containing exactly "hello world", then report what you changed.',
    });
    await printFullStream({ result: createResult });

    const editResult = await agent.stream({
      session,
      prompt:
        'Edit `notes.md` to capitalize "Hello", then report what you changed.',
    });
    await printFullStream({ result: editResult });
  } finally {
    await session.destroy();
  }
});
