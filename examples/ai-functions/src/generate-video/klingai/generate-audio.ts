import { klingai, type KlingAIVideoModelOptions } from '@ai-sdk/klingai';
import { experimental_generateVideo as generateVideo } from 'ai';
import { presentVideos } from '../../lib/present-video';
import { run } from '../../lib/run';
import { withSpinner } from '../../lib/spinner';

run(async () => {
  const { videos } = await withSpinner(
    'Generating KlingAI text-to-video with audio (kling-v2.6-t2v)...',
    () =>
      generateVideo({
        model: klingai.video('kling-v2.6-t2v'),
        prompt:
          'A street musician playing saxophone on a rainy evening, with city ambience.',
        duration: 5,
        generateAudio: true,
        providerOptions: {
          klingai: {
            mode: 'std',
            pollTimeoutMs: 600000,
          } satisfies KlingAIVideoModelOptions,
        },
      }),
  );

  await presentVideos(videos);
});
