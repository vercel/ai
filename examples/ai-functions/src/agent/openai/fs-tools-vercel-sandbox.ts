import { createVercelNetworkSandboxSession } from '@ai-sdk/sandbox-vercel';
import { experimental_createFsTools as createFsTools } from '@ai-sdk/tool-fs';
import { isStepCount, ToolLoopAgent } from 'ai';
import { run } from '../../lib/run';

const fsTools = createFsTools();

const agent = new ToolLoopAgent({
  model: 'openai/gpt-6-astra',
  tools: fsTools,
  stopWhen: isStepCount(20),
});

run(async () => {
  const session = await createVercelNetworkSandboxSession({
    timeout: 5 * 60 * 1000,
    runtime: 'node24',
  });

  try {
    const sandbox = session.restricted();
    await sandbox.writeTextFile({
      path: 'package.json',
      content: JSON.stringify(
        {
          name: 'greeter',
          type: 'module',
          scripts: { start: 'node index.js' },
        },
        null,
        2,
      ),
    });
    await sandbox.writeTextFile({
      path: 'index.js',
      content: [
        "import { greet } from './lib/greet.js';",
        '',
        "console.log(greet('World'));",
        '',
      ].join('\n'),
    });
    await sandbox.writeTextFile({
      path: 'lib/greet.js',
      content: [
        'export function greet(name) {',
        "  return 'Hello, ' + name;",
        '}',
        '',
      ].join('\n'),
    });

    const result = await agent.generate({
      prompt:
        'Change the greeting to use a template literal and end it with an ' +
        'exclamation mark. Then add a README.md that explains how to run it.',
      experimental_sandbox: sandbox,
    });

    console.log(result.text);
    console.log();
    console.log((await sandbox.run({ command: 'node index.js' })).stdout);
    console.log(await sandbox.readTextFile({ path: 'README.md' }));
  } finally {
    await session.destroy();
  }
});
