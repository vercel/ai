import { minimax, type MiniMaxVideoPartOptions } from '@ai-sdk/minimax';
import { generateText } from 'ai';
import { readFileSync } from 'node:fs';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: minimax('minimax-m3.1-flash'),
    providerOptions: { minimax: { effort: 'low' } },
    maxOutputTokens: 16384,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Describe what happens in this video.' },
          {
            type: 'file',
            mediaType: 'video/mp4',
            // data: new URL('https://samplelib.com/mp4/sample-20s.mp4'), // URL
            data: readFileSync('./data/prudence.mp4'),
            providerOptions: {
              minimax: { fps: 1 } satisfies MiniMaxVideoPartOptions,
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
