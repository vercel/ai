import { azure } from '@ai-sdk/azure';
import { stepCountIs, streamText } from 'ai';
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
  const result = streamText({
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

  for await (const chunk of result.fullStream) {
    switch (chunk.type) {
      case 'text-delta': {
        process.stdout.write(chunk.text);
        break;
      }

      case 'tool-call': {
        console.log(
          `\x1b[32m\x1b[1mTool call:\x1b[22m ${JSON.stringify(chunk, null, 2)}\x1b[0m`,
        );
        break;
      }

      case 'tool-result': {
        console.log(
          `\x1b[32m\x1b[1mTool result:\x1b[22m ${JSON.stringify(chunk, null, 2)}\x1b[0m`,
        );
        break;
      }

      case 'error':
        console.error('Error:', chunk.error);
        break;
    }
  }
});
