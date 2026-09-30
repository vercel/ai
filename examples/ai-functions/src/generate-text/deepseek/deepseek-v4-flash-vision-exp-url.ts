import { deepseek } from '@ai-sdk/deepseek';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const { text, usage, finishReason } = await generateText({
    model: deepseek('deepseek-v4-flash-vision-exp'),
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'What animal is depicted in this image? Answer with one word.',
          },
          {
            type: 'file',
            mediaType: 'image/png',
            data: 'https://cdn.deepseek.com/platform/favicon.png',
          },
        ],
      },
    ],
  });

  console.log(text);
  console.log('Token usage:', usage);
  console.log('Finish reason:', finishReason);
});
