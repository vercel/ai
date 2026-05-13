import { run } from '../../lib/run';
import { LocalSandbox } from '../../sandbox/local-sandbox';
import { sandboxAgent } from './sandbox-agent';

run(async () => {
  const sandbox = new LocalSandbox({
    rootDirectory: `${process.env.HOME}/Downloads`,
  });

  const result = await sandboxAgent.generate({
    prompt: 'List the files in the directory',
    sandbox,
  });

  console.log(result.text);
});
