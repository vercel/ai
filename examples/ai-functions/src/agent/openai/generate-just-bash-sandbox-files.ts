import { Bash, OverlayFs } from 'just-bash';
import { run } from '../../lib/run';
import { JustBashSandbox } from '../../sandbox/just-bash-sandbox';
import { sandboxAgent } from './sandbox-agent';

run(async () => {
  const overlay = new OverlayFs({ root: process.cwd() });
  const sandbox = new JustBashSandbox(
    new Bash({ fs: overlay, cwd: overlay.getMountPoint() }),
  );

  const result = await sandboxAgent.generate({
    prompt:
      'Write a haiku about TypeScript to a file named "haiku.txt", then read it back and summarize what it says.',
    experimental_sandbox: sandbox,
  });

  console.log(result.text);
});
