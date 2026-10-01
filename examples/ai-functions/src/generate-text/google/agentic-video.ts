import { google, type GoogleInteractionsVideoOptions } from '@ai-sdk/google';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: google('gemini-3.8-flash'),
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'file',
            mediaType: 'video/mp4',
            data: new URL('https://www.youtube.com/watch?v=9hE5-98ZeCg'),
            providerOptions: {
              google: {
                processing: 'agentic',
              } satisfies GoogleInteractionsVideoOptions,
            },
          },
          {
            type: 'text',
            text: 'Identify the three most important moments in this video and include timestamps.',
          },
        ],
      },
    ],
  });

  console.log(result.text);
  console.log();
  console.log('Token usage:', result.usage);
});
