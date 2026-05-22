import { createJustBashSandbox } from '@ai-sdk/sandbox-just-bash';
import { OverlayFs, Sandbox } from 'just-bash';
import { run } from '../../lib/run';
import { sandboxAgent } from './sandbox-agent';

run(async () => {
  const overlay = new OverlayFs({ root: process.cwd() });
  const handle = await createJustBashSandbox({
    sandbox: await Sandbox.create({
      fs: overlay,
      cwd: overlay.getMountPoint(),
    }),
  }).create();

  const result = await sandboxAgent.generate({
    prompt:
      'Write a haiku about TypeScript to a file named "haiku.txt", then read it back and summarize what it says.',
    experimental_sandbox: handle.session,
  });

  console.log(result.text);
});
