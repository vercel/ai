import { spacexai } from '@ai-sdk/spacexai';
import { streamText, uploadFile } from 'ai';
import fs from 'node:fs';
import { run } from '../../lib/run';

run(async () => {
  const { providerReference, mediaType, filename, providerMetadata } =
    await uploadFile({
      api: spacexai.files(),
      data: fs.readFileSync('./data/comic-cat.png'),
      filename: 'comic-cat.png',
    });

  console.log('Provider reference:', providerReference);
  console.log('Media type:', mediaType);
  console.log('Filename:', filename);
  console.log('Provider metadata:', providerMetadata);

  const result = streamText({
    model: spacexai.responses('grok-4.5'),
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Describe what you see in this image.',
          },
          {
            type: 'file',
            mediaType: 'image',
            data: providerReference,
          },
        ],
      },
    ],
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }
  console.log();
});
