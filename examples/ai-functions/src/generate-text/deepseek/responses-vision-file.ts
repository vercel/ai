import { deepSeek } from '@ai-sdk/deepseek';
import { generateText, uploadFile } from 'ai';
import fs from 'node:fs';
import { run } from '../../lib/run';

run(async () => {
  const { providerReference, mediaType } = await uploadFile({
    api: deepSeek.files(),
    data: fs.readFileSync('./data/comic-cat.png'),
    filename: 'comic-cat.png',
  });

  const { text, usage, finishReason } = await generateText({
    model: deepSeek.responses('deepseek-v4-flash-vision-exp'),
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
            mediaType: mediaType ?? 'image/png',
            data: providerReference,
          },
        ],
      },
    ],
  });

  console.log(text);
  console.log('Token usage:', usage);
  console.log('Finish reason:', finishReason);
});
