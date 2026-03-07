import { azure } from '@ai-sdk/azure';
import { generateText, stepCountIs } from 'ai';
import { executeShellCommand } from '../../lib/shell-executor';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: azure.responses('gpt-5.1'),
    tools: {
      shell: azure.tools.shell({
        execute: async ({ action }) => {
          const outputs = await Promise.all(
            action.commands.map(command =>
              executeShellCommand(command, action.timeoutMs),
            ),
          );

          return { output: outputs };
        },
      }),
    },
    prompt:
      'Create a file in my current directory called dec1.txt with the text: THIS WORKS!',
    stopWhen: stepCountIs(5),
  });

  console.log('Result:', result.text);
});
