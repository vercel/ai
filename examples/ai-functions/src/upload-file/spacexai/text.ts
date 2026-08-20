import { spacexai } from '@ai-sdk/spacexai';
import { generateText, uploadFile } from 'ai';
import fs from 'node:fs';
import { run } from '../../lib/run';

run(async () => {
  const { providerReference, mediaType, filename, providerMetadata } =
    await uploadFile({
      api: spacexai.files(),
      data: fs.readFileSync('./data/compaction-data.txt'),
      filename: 'compaction-data.txt',
    });

  console.log('Provider reference:', providerReference);
  console.log('Media type:', mediaType);
  console.log('Filename:', filename);
  console.log('Provider metadata:', providerMetadata);

  const result = await generateText({
    model: spacexai.responses('grok-4.5'),
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'What topics does this document cover?',
          },
          {
            type: 'file',
            data: providerReference,
            mediaType: 'text/plain',
          },
        ],
      },
    ],
  });

  console.log(result.text);
});
