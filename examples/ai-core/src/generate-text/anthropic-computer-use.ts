import { anthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import 'dotenv/config';
import { z } from 'zod';

async function main() {
  const result = await generateText({
    model: anthropic('claude-3-5-sonnet-20241022'),
    tools: {
      computer: {
        type: 'provider-defined',
        id: 'anthropic.computer_20241022',
        args: {
          displayWidthPx: 100,
          displayHeightPx: 100,
          displayNumber: 1,
        },
        parameters: z.object({
          action: z.enum([
            'key',
            'type',
            'mouse_move',
            'left_click',
            'left_click_drag',
            'right_click',
            'middle_click',
            'double_click',
            'screenshot',
            'cursor_position',
          ]),
          coordinate: z.object({ x: z.number(), y: z.number() }).nullish(),
          text: z.string().nullish(),
        }),
      },
      bash: anthropic.tools.bash_20241022({
        execute: async ({ command }) => {
          return `
          ❯ ls
          README.md     build         data          node_modules  package.json  src           tsconfig.json
`;
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
}

main().catch(console.error);
