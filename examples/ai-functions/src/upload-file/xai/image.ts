import { xai } from '@ai-sdk/xai';
import { generateText, uploadFile } from 'ai';
import fs from 'node:fs';
import { run } from '../../lib/run';

run(async () => {
  const { providerReference, providerMetadata } = await uploadFile({
    files: xai.files(),
    data: fs.readFileSync('./data/comic-cat.png'),
    filename: 'comic-cat.png',
  });

  console.log('Provider reference:', providerReference);
  console.log('Provider metadata:', providerMetadata);

  const result = await generateText({
    model: xai.responses('grok-4'),
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Describe what you see in this image.',
          },
          {
            type: 'image',
            image: providerReference,
          },
        ],
      },
    ],
  });

  console.log(result.text);
});
