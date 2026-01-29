import { fal } from '@ai-sdk/fal';
import { experimental_generateVideo } from 'ai';
import { presentVideos } from '../../lib/present-video';
import { run } from '../../lib/run';
import { withSpinner } from '../../lib/spinner';

run(async () => {
  const { videos } = await withSpinner('Generating video...', () =>
    experimental_generateVideo({
      model: fal.video('veo-3.1'),
      prompt:
        'A Skeleton King sitting in a throne in Lafayette Park in San Francisco amidst fireflies at sunset.',
      aspectRatio: '16:9',
      duration: 5,
    }),
  );

  await presentVideos(videos);
});
