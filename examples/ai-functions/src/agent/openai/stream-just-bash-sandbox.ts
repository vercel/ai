import { Bash } from 'just-bash';
import { run } from '../../lib/run';
import { JustBashSandbox } from '../../sandbox/just-bash-sandbox';
import { sandboxAgent } from './sandbox-agent';
import { printFullStream } from '../../lib/print-full-stream';

run(async () => {
  const sandbox = new JustBashSandbox(
    new Bash({
      cwd: '/home/user',
    }),
  );

  const result = await sandboxAgent.stream({
    prompt:
      'Create a file named greeting.txt with a short greeting, then list the files and show the file contents.',
    sandbox,
  });

  await printFullStream({ result });
});
