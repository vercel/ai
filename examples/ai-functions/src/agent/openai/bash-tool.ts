import { openai } from '@ai-sdk/openai';
import { createBashTool } from '@ai-sdk/tools/bash';
import { isStepCount, ToolLoopAgent } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const { bash, sandbox } = await createBashTool({
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
      'Whats our total sales revenue. Write a short summary to report.md.',
    onStepEnd: step => {
      console.log(JSON.stringify(step.content, null, 2));
    },
  });

  console.log(await sandbox.readFile('/workspace/report.md'));
});
