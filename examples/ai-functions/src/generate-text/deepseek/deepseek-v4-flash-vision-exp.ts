import { deepSeek } from '@ai-sdk/deepseek';
import { generateText } from 'ai';
import fs from 'node:fs';
import { run } from '../../lib/run';

run(async () => {
  const { text, usage, finishReason } = await generateText({
    model: deepSeek('deepseek-v4-flash-vision-exp'),
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
            data: fs.readFileSync('./data/comic-cat.png'),
          },
        ],
      },
    ],
  });

  console.log(text);
  console.log('Token usage:', usage);
  console.log('Finish reason:', finishReason);
});
