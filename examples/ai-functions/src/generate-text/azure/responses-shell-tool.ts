import { azure } from '@ai-sdk/azure';
import { generateText, isStepCount } from 'ai';
import { executeShellCommand } from '../../lib/shell-executor';
import { run } from '../../lib/run';

// This example runs model-proposed commands directly on your computer.
// For interactive approval, see generate-text/azure/responses-shell-tool-with-approval.ts.
run(async () => {
  const result = await generateText({
    // Replace with your Azure deployment name that supports this shell mode.
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
    stopWhen: isStepCount(20),
    prompt: 'Print a greeting with the shell.',
  });

  console.log('Result:', result.text);
});
