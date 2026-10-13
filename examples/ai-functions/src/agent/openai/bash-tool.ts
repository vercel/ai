import { createJustBashNetworkSandboxSession } from '@ai-sdk/sandbox-just-bash';
import { bashTool } from '@ai-sdk/bash-tool';
import { isStepCount, ToolLoopAgent } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const session = await createJustBashNetworkSandboxSession();

  try {
    const sandbox = session.restricted();
    const bash = await bashTool({
      sandbox: session.restricted(),
      files: {
        'sales.json': JSON.stringify([
          { product: 'Apples', revenue: 120 },
          { product: 'Pears', revenue: 80 },
        ]),
      },
    });

    const agent = new ToolLoopAgent({
      model: 'openai/gpt-6-astra',
      tools: { bash },
      stopWhen: isStepCount(15),
    });

    const result = await agent.generate({
      prompt:
        'What is our total sales revenue? Write a short summary to report.md.',
    });

    console.log(JSON.stringify(result.content, null, 2));
    console.log(await sandbox.readTextFile({ path: '/workspace/report.md' }));
  } finally {
    await session.destroy();
  }
});
