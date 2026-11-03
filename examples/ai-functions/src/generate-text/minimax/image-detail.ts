import { minimax, type MiniMaxImagePartOptions } from '@ai-sdk/minimax';
import { generateText } from 'ai';
import { readFileSync } from 'node:fs';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: minimax('minimax-m3.1-flash'),
    reasoning: 'low',
    maxOutputTokens: 16384,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Describe the image, including any readable text.',
          },
          {
            type: 'file',
            mediaType: 'image/png',
            data: readFileSync('./data/comic-cat.png'),
            providerOptions: {
              minimax: { detail: 'high' } satisfies MiniMaxImagePartOptions,
            },
          },
        ],
      },
    ],
  });

  console.log(result.text);
  console.log('Token usage:', result.usage);
  console.log('Finish reason:', result.finishReason);
});
