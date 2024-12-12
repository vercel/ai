import 'dotenv/config';
import { vertexAnthropic } from '@ai-sdk/google-vertex/anthropic';
import { generateText } from 'ai';
import fs from 'node:fs';

async function main() {
  const result = await generateText({
    model: vertexAnthropic('claude-3-5-sonnet-v2@20241022'),
    tools: {
      computer: vertexAnthropic.tools.computer_20241022({
        displayWidthPx: 1024,
        displayHeightPx: 768,

        async execute({ action, coordinate, text }) {
          console.log('args', { action, coordinate, text });
          switch (action) {
            case 'screenshot': {
              // multipart result:
              return {
                type: 'image',
                data: fs
                  .readFileSync('./data/screenshot-editor.png')
                  .toString('base64'),
              };
            }
            default: {
              console.log('Action:', action);
              console.log('Coordinate:', coordinate);
              console.log('Text:', text);
              return `executed ${action}`;
            }
          }
        },

        // map to tool result content for LLM consumption:
        experimental_toToolResultContent(result) {
          return typeof result === 'string'
            ? [{ type: 'text', text: result }]
            : [{ type: 'image', data: result.data, mimeType: 'image/png' }];
        },
      }),
    },
    prompt:
      'How can I switch to dark mode? Take a look at the screen and tell me.',
    maxSteps: 5,
  });

  console.log(result.text);
  console.log(result.finishReason);
  console.log(JSON.stringify(result.toolCalls, null, 2));
}

main().catch(console.error);
