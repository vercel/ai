import { createJustBashNetworkSandboxSession } from '@ai-sdk/sandbox-just-bash';
import { experimental_createBashTool as createBashTool } from '@ai-sdk/tool-bash';
import { isStepCount, ToolLoopAgent } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const session = await createJustBashNetworkSandboxSession();

  try {
    const sandbox = session.restricted();
    await sandbox.writeTextFile({
      path: 'sales.json',
      content: JSON.stringify([
        { product: 'Apples', revenue: 120 },
        { product: 'Pears', revenue: 80 },
      ]),
    });
    const bash = await createBashTool({ sandbox, timeout: 10_000 });

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
    console.log(await sandbox.readTextFile({ path: 'report.md' }));
  } finally {
    await session.destroy();
  }
});
