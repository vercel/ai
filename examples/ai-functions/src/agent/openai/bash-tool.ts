import { createJustBashNetworkSandboxSession } from '@ai-sdk/sandbox-just-bash';
import { createBashTool } from '@ai-sdk/tools/bash';
import { isStepCount, ToolLoopAgent } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const session = await createJustBashNetworkSandboxSession();

  try {
    const { bash, sandbox } = await createBashTool({
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

    console.log(result.text);
    console.log(await sandbox.readFile('/workspace/report.md'));
  } finally {
    await session.destroy();
  }
});
