import { azure, createAzure } from '@ai-sdk/azure';
import { experimental_generateImage as generateImage } from 'ai';
import { presentImages } from '../lib/present-image';
// import 'dotenv/config';

const provider = createAzure({
  resourceName: 'test-resource',
  baseURL: 'https://test-resource.openai.azure.com/openai/deployments',
  apiKey: 'test-api-key',
});

async function main() {
  const { image } = await generateImage({
    model: provider.imageModel('dalle-3'), // Use your own deployment
    prompt: 'Santa Claus driving a Cadillac',
  });

  await presentImages([image]);
}

main().catch(console.error);
