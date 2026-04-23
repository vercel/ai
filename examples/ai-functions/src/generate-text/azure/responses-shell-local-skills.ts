import { azure } from '@ai-sdk/azure';
import { generateText, stepCountIs } from 'ai';
import { resolve } from 'path';
import { executeShellCommand } from '../../lib/shell-executor';
import { run } from '../../lib/run';

/**
 * *** NOTICE ***
 *
 * This example is provided for reference only.
 * The `skills` configuration is not currently supported on the Microsoft Azure platform.
 *
 * Once Azure adds support for this feature, the example will function as expected
 * and will be updated accordingly.
 */

run(async () => {
  const result = await generateText({
    model: azure.responses('gpt-5.2'),
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
    stopWhen: stepCountIs(5),
  });

  console.log('Result:', result.text);
});
