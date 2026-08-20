import { spacexai } from '@ai-sdk/spacexai';
import { uploadFile } from 'ai';
import fs from 'node:fs';
import { run } from '../../lib/run';

run(async () => {
  const { providerReference, mediaType, filename, providerMetadata } =
    await uploadFile({
      api: spacexai,
      data: fs.readFileSync('./data/comic-cat.png'),
      filename: 'comic-cat.png',
    });

  console.log('Provider reference:', providerReference);
  console.log('Media type:', mediaType);
  console.log('Filename:', filename);
  console.log('Provider metadata:', providerMetadata);
});
