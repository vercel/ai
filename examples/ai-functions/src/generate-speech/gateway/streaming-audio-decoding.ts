import type { GatewayProviderOptions } from '@ai-sdk/gateway';
import { generateSpeech } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const { audio } = await generateSpeech({
    model: 'openai/tts-1',
    text:
      'Long speech arrives as base64 inside a JSON response. With streaming ' +
      'decoding enabled, the SDK turns it into bytes while the response is ' +
      'still being read, so the base64 string and the whole response text ' +
      'are not held in memory at the same time.',
    providerOptions: {
      gateway: {
        experimental_streamingAudioDecoding: true,
      } satisfies GatewayProviderOptions,
    },
  });

  console.log('Media type:', audio.mediaType);
  console.log('Audio bytes:', audio.uint8Array.byteLength);
});
