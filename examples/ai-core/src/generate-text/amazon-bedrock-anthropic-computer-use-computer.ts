import { bedrockAnthropic } from '@ai-sdk/amazon-bedrock/anthropic';
import { generateText, stepCountIs } from 'ai';
import 'dotenv/config';
import fs from 'fs';
import { run } from '../lib/run';

run(async () => {
  const result = await generateText({
    model: bedrockAnthropic('us.anthropic.claude-sonnet-4-5-20250929-v1:0'),
    tools: {
      computer: bedrockAnthropic.tools.computer_20241022({
        displayWidthPx: 1024,
        displayHeightPx: 768,
        async execute({ action, coordinate, text }) {
          console.log(`Computer action: ${action}`, { coordinate, text });
          switch (action) {
            case 'screenshot': {
              return {
                type: 'image',
                data: fs
                  .readFileSync('./data/screenshot-editor.png')
                  .toString('base64'),
              };
            }
            default: {
              return `executed ${action}`;
            }
          }
        },
        toModelOutput({ output }) {
          return {
            type: 'content',
            value: [
              typeof output === 'string'
                ? { type: 'text', text: output }
                : {
                    type: 'media',
                    data: output.data,
                    mediaType: 'image/png',
                  },
            ],
          };
        },
      }),
    },
    prompt:
      'How can I switch to dark mode? Take a look at the screen and tell me.',
    stopWhen: stepCountIs(5),
  });

  console.log('Response:', result.text);
  console.log();
  console.log('Finish reason:', result.finishReason);
  console.log('Usage:', result.usage);
});
