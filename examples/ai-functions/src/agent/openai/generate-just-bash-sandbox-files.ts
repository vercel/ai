import { createJustBashSandbox } from '@ai-sdk/sandbox-just-bash';
import { run } from '../../lib/run';
import { sandboxAgent } from './sandbox-agent';

run(async () => {
  const handle = await createJustBashSandbox({
    overlayRoot: process.cwd(),
  }).create();

  const result = await sandboxAgent.generate({
    prompt:
      'Write a haiku about TypeScript to a file named "haiku.txt", then read it back and summarize what it says.',
    experimental_sandbox: handle.session,
  });

  console.log(result.text);
});
