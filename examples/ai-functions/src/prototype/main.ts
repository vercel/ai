import { run } from '../lib/run';
import { LocalSandbox } from './local-sandbox';
import { sandboxAgent } from './sandbox-agent';

run(async () => {
  const sandbox = new LocalSandbox({
    rootDirectory: `${process.env.HOME}/Downloads`,
  });

  const result = await sandboxAgent.stream({
    prompt: 'List the files in the directory',
    sandbox,
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }
});
