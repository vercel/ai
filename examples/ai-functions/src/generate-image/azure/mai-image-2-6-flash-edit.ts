import { createAzure, type AzureImageModelOptions } from '@ai-sdk/azure';
import { generateImage } from 'ai';
import fs from 'node:fs';
import { presentImages } from '../../lib/present-image';
import { run } from '../../lib/run';

// Requires a Foundry resource with an MAI-Image-2.6-Flash deployment.
const azure = createAzure({
  resourceName: process.env.AZURE_MAI_RESOURCE_NAME,
  apiKey: process.env.AZURE_MAI_API_KEY ?? process.env.AZURE_API_KEY,
});

run(async () => {
  const result = await generateImage({
    model: azure.image('MAI-Image-2.6-Flash'), // Use your own deployment
    prompt: {
      text: 'Turn the cat into a watercolor painting',
      images: [fs.readFileSync('data/comic-cat.png')],
    },
    providerOptions: {
      // `api: 'mai'` keeps custom deployment names on the MAI image API.
      azure: { api: 'mai' } satisfies AzureImageModelOptions,
    },
  });

  console.log('Usage:', result.usage);
  console.log('Warnings:', result.warnings);
  await presentImages(result.images);
});
