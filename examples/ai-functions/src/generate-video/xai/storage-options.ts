import { xai, type XaiVideoModelOptions } from '@ai-sdk/xai';
import { experimental_generateVideo as generateVideo } from 'ai';
import { presentVideos } from '../../lib/present-video';
import { run } from '../../lib/run';
import { withSpinner } from '../../lib/spinner';

run(async () => {
  const { video, warnings, providerMetadata } = await withSpinner(
    'Generating and storing an xAI video...',
    () =>
      generateVideo({
        model: xai.video('grok-imagine-video-1.5'),
        prompt:
          'A tiny paper airplane glides through a bright modern library, ' +
          'cinematic tracking shot.',
        duration: 5,
        aspectRatio: '16:9',
        providerOptions: {
          xai: {
            storageOptions: {
              filename: 'paper-airplane.mp4',
              expiresAfter: 86_400,
              publicUrl: { expiresAfter: 3_600 },
            },
            pollTimeoutMs: 600_000,
          } satisfies XaiVideoModelOptions,
        },
      }),
  );

  console.log('Warnings:', warnings);
  console.log('xAI metadata:', providerMetadata.xai);
  await presentVideos([video]);
});
