import { azure } from '@ai-sdk/azure';
import { generateText, isStepCount } from 'ai';
import { resolve } from 'path';
import { executeShellCommand } from '../../lib/shell-executor';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: azure.responses('gpt-5.4-mini'),
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
        environment: {
          type: 'local',
          skills: [
            {
              name: 'island-rescue',
              description: 'How to be rescued from a lonely island',
              path: resolve('data/island-rescue'),
            },
          ],
        },
      }),
    },
    prompt:
      'You are trapped and lost on a lonely island in 1895. Find a way to get rescued!',
    stopWhen: isStepCount(20),
  });

  console.log('Result:', result.text);
  console.log(result.dynamicToolResults);
  console.log(result.dynamicToolCalls);
  console.log(result.toolCalls);
  console.log(result.toolResults);
});
