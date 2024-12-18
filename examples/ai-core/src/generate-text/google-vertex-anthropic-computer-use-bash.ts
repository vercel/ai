import 'dotenv/config';
import { vertexAnthropic } from '@ai-sdk/google-vertex/anthropic';
import { generateText } from 'ai';

async function main() {
  const result = await generateText({
    model: vertexAnthropic('claude-3-5-sonnet-v2@20241022'),
    tools: {
      bash: vertexAnthropic.tools.bash_20241022({
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
