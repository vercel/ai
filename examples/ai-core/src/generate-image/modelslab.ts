import { createModelsLab } from '@ai-sdk/modelslab';
import { experimental_generateImage as generateImage } from 'ai';
import { presentImages } from '../lib/present-image';
import 'dotenv/config';

async function main() {
  console.log('Starting ModelsLab image generation...');

  // Create provider with explicit API key for testing
  const modelslab = createModelsLab({
    apiKey: process.env.MODELSLAB_API_KEY || 'test-api-key',
  });

  const { images, response, providerMetadata } = await generateImage({
    model: modelslab.image('realtime-text2img'),
    prompt:
      'ultra realistic close up portrait ((beautiful pale cyberpunk female with heavy black eyeliner))',
    n: 1,
    size: '512x512',
  });

  console.log('Response:', JSON.stringify(response, null, 2));
  console.log('Provider Metadata:', JSON.stringify(providerMetadata, null, 2));

  await presentImages(images);
}

main().catch(console.error);
