import { replicate } from '@ai-sdk/replicate';
import { generateImage } from 'ai';

async function main() {
  try {
    console.log('Starting Replicate image generation with maxWaitTimeInSeconds=1...');
    const result = await generateImage({
      model: replicate.image('black-forest-labs/flux-dev'),
      prompt: 'A watercolor landscape at twilight',
      size: '1024x1024',
      providerOptions: {
        replicate: {
          maxWaitTimeInSeconds: 1,
        },
      },
    });
    console.log('SUCCESS', { imageCount: result.images.length });
  } catch (error) {
    console.log('ERROR_CLASS', error?.constructor?.name);
    console.log('ERROR_NAME', (error as any)?.name);
    console.log('ERROR_MESSAGE', (error as any)?.message);
    console.log('ERROR_STATUS', (error as any)?.statusCode);
    console.log('ERROR_URL', (error as any)?.url);
    console.log('CAUSE_CLASS', (error as any)?.cause?.constructor?.name);
    console.log('CAUSE_NAME', (error as any)?.cause?.name);
    console.log('CAUSE_MESSAGE', (error as any)?.cause?.message);
    console.dir(error, { depth: 8 });
    process.exitCode = 1;
  }
}

void main();
