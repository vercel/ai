import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';
import { LocalSandbox } from '../../sandbox/local-sandbox';
import { sandboxAgent } from './sandbox-agent';

run(async () => {
  const sandbox = new LocalSandbox({
    rootDirectory: `${process.env.HOME}`,
  });

  const result = await sandboxAgent.stream({
    prompt:
      'List the files in the directory, ' +
      'then read the content of the first file using the readFile tool' +
      ' and tell me what you see.',

    sandbox,
  });

  await printFullStream({ result });
});
