import type { GatewayProviderOptions } from '@ai-sdk/gateway';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const { files } = await generateText({
    model: 'google/gemini-3.1-flash-image',
    prompt: 'A mountain lake at sunrise',
    providerOptions: {
      gateway: {
        experimental_streamingImageDecoding: true,
      } satisfies GatewayProviderOptions,
    },
  });

  for (const file of files) {
    console.log('Media type:', file.mediaType);
    console.log('File bytes:', file.uint8Array.byteLength);
  }
});
