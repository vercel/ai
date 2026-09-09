import { google, type GoogleInteractionsVideoOptions } from '@ai-sdk/google';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: google.interactions('gemini-3.7-flash'),
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'file',
            mediaType: 'video',
            data: 'https://youtu.be/yxKA0NnNJeo?si=fRyOkgoCH8Va0wJL',
            providerOptions: {
              google: {
                processing: 'agentic',
              } satisfies GoogleInteractionsVideoOptions,
            },
          },
          {
            type: 'text',
            text: 'Identify the three most important moments in this video. Explain why each matters and include timestamps.',
          },
        ],
      },
    ],
    providerOptions: {
      google: {
        thinkingSummaries: 'auto',
      },
    },
  });

  console.log('RESULT CONTENT:');
  console.log(JSON.stringify(result.content, null, 2));
  console.log();
  console.log('Token usage:', result.usage);
  console.log('Finish reason:', result.finishReason);
});
