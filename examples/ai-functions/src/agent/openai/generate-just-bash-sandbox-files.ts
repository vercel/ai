import { Sandbox } from 'just-bash';
import { run } from '../../lib/run';
import { JustBashSandboxSession } from '../../sandbox/just-bash-sandbox';
import { sandboxAgent } from './sandbox-agent';

run(async () => {
  const sandbox = new JustBashSandboxSession(
    await Sandbox.create({ overlayRoot: process.cwd() }),
  );

  const result = await sandboxAgent.generate({
    prompt:
      'Write a haiku about TypeScript to a file named "haiku.txt", then read it back and summarize what it says.',
    experimental_sandbox: sandbox,
  });

  console.log(result.text);
});
