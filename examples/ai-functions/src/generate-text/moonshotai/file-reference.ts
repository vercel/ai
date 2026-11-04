import { moonshotai } from '@ai-sdk/moonshotai';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: moonshotai('kimi-k2.6'),
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'file',
            data: {
              type: 'reference',
              reference: {
                moonshotai: process.env.MOONSHOT_FILE_REFERENCE!,
              },
            },
            mediaType: 'image/png',
          },
          {
            type: 'file',
            data: {
              type: 'text',
              text: 'Focus on the visible objects and any readable text.',
            },
            mediaType: 'text/plain',
          },
        ],
      },
    ],
  });

  console.log(result.text);
});
