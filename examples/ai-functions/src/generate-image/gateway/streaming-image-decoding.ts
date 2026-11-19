import type { GatewayProviderOptions } from '@ai-sdk/gateway';
import { generateImage } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const { image } = await generateImage({
    model: 'bfl/flux-kontext-pro',
    prompt: 'A mountain lake at sunrise',
    providerOptions: {
      gateway: {
        experimental_streamingImageDecoding: true,
      } satisfies GatewayProviderOptions,
    },
  });

  console.log('Media type:', image.mediaType);
  console.log('Image bytes:', image.uint8Array.byteLength);
});
