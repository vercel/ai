import { spacexai } from '@ai-sdk/spacexai';
import { generateText } from 'ai';
import fs from 'node:fs';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: spacexai('grok-4.5'),
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Describe the image in detail.' },
          {
            type: 'file',
            mediaType: 'image/png',
            data: fs.readFileSync('./data/comic-cat.png'),
            // process the image at reduced resolution (fewer input tokens)
            providerOptions: { spacexai: { imageDetail: 'low' } },
          },
        ],
      },
    ],
  });

  console.log(result.text);
  console.log();
  console.log('Usage:', result.usage);
});
