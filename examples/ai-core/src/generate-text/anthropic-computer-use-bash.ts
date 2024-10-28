import { anthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = await generateText({
    model: anthropic('claude-3-5-sonnet-20241022'),
    tools: {
      bash: anthropic.tools.bash_20241022({
        async execute({ command }) {
          console.log('COMMAND', command);
          return [
            {
              type: 'text',
              text: `
          ❯ ls
          README.md     build         data          node_modules  package.json  src           tsconfig.json
          `,
            },
          ];
        },
      }),
    },
    prompt: 'List the files in my home directory.',
    maxSteps: 2,
  });

  console.log(result.text);
}

main().catch(console.error);
