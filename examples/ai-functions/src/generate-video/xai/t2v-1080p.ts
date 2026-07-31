import { xai, type XaiVideoModelOptions } from '@ai-sdk/xai';
import { experimental_generateVideo as generateVideo } from 'ai';
import { presentVideos } from '../../lib/present-video';
import { run } from '../../lib/run';
import { withSpinner } from '../../lib/spinner';

run(async () => {
  const { video } = await withSpinner(
    'Generating xAI text-to-video at 1080p with grok-imagine-video-1.5...',
    () =>
      generateVideo({
        model: xai.video('grok-imagine-video-1.5'),
        prompt:
          'A glowing crystal-powered rocket launching from the red dunes of Mars.',
        aspectRatio: '16:9',
        duration: 8,
        providerOptions: {
          xai: {
            resolution: '1080p',
            pollTimeoutMs: 600000, // 10 minutes
          } satisfies XaiVideoModelOptions,
        },
      }),
  );

  await presentVideos([video]);
});
