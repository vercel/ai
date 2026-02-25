import { openai } from '@ai-sdk/openai';
import { generateText, stepCountIs } from 'ai';
import { executeShellCommand } from '../../lib/shell-executor';
import { run } from '../../lib/run';

run(async () => {
  const result1 = await generateText({
    model: openai.responses('gpt-5.2'),
    tools: {
      shell: openai.tools.shell({
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
    prompt: 'Run uname -a',
    stopWhen: stepCountIs(5),
  });

  console.log('Turn 1:', result1.text);

  const result2 = await generateText({
    model: openai.responses('gpt-5.2'),
    tools: {
      shell: openai.tools.shell({
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
    messages: [
      { role: 'user', content: 'Run uname -a' },
      ...result1.response.messages,
      { role: 'user', content: 'What architecture do you run in?' },
    ],
    stopWhen: stepCountIs(5),
  });

  console.log('Turn 2:', result2.text);
});
