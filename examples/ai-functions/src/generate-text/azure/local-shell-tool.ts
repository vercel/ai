import { azure } from '@ai-sdk/azure';
import { generateText, stepCountIs } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: azure.responses('gpt-5-codex'),
    tools: {
      local_shell: azure.tools.localShell({
        execute: async ({ action }) => {
          console.log('ACTION');
          console.dir(action, { depth: Infinity });

          const stdout = `
❯ ls
README.md     build         data          node_modules  package.json  src           tsconfig.json
          `;

          return { output: stdout };
        },
      }),
    },
    prompt: 'List the files in my home directory.',
    stopWhen: stepCountIs(20),
    onStepFinish: step => {
      console.dir(step.content, { depth: Infinity });
    },
  });
  console.log('result:');
  console.log(result.text);
});
