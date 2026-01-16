import { xai } from '@ai-sdk/xai';
import { generateText } from 'ai';
import fs from 'node:fs';
import { run } from '../lib/run';

run(async () => {
  const result = await generateText({
    model: xai.responses('grok-2-vision-1212'),
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Describe the image in detail.' },
          {
            type: 'image',
            image: fs.readFileSync('./data/comic-cat.png'),
          },
        ],
      },
    ],
  });

  console.log(result.text);
  console.log();
  console.log('Finish reason:', result.finishReason);
  console.log('Usage:', result.usage);
});
