import { google, type GoogleVideoMetadata } from '@ai-sdk/google';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: google('gemini-2.5-flash'),
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Summarize this segment of the video.' },
          {
            type: 'file',
            data: new URL('https://www.youtube.com/watch?v=9hE5-98ZeCg'),
            mediaType: 'video/mp4',
            providerOptions: {
              google: {
                videoMetadata: {
                  startOffset: '60s',
                  endOffset: '120s',
                  fps: 1,
                } satisfies GoogleVideoMetadata,
              },
            },
          },
        ],
      },
    ],
  });

  console.log(result.text);
});
