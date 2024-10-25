import { anthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = await generateText({
    model: anthropic('claude-3-5-sonnet-20241022'),
    tools: {
      computer: anthropic.tools.computer_20241022({
        displayWidthPx: 100,
        displayHeightPx: 100,
        async execute({ action, coordinate, text }) {
          return [{ type: 'text', text: '' }];
        },
      }),
      bash: anthropic.tools.bash_20241022({
        async execute({ command }) {
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
      str_replace_editor: anthropic.tools.textEditor_20241022({
        async execute({ command, path, old_str, new_str }) {
          return [{ type: 'text', text: '' }];
        },
      }),
    },
    prompt: 'List the files in my home directory.',
    maxSteps: 2,
  });

  for (const toolResult of result.toolResults) {
    switch (toolResult.toolName) {
      case 'bash': {
        toolResult.args.command; // string
        toolResult.result; // string
        break;
      }
    }
  }

  console.log(result.text);
  console.log(result.finishReason);
  console.log(JSON.stringify(result.toolCalls, null, 2));
  console.log(JSON.stringify(result.steps, null, 2));
}

main().catch(console.error);
