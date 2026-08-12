import { siftq } from '@ai-sdk/siftq';
import { experimental_generateVideo as generateVideo } from 'ai';
import { presentVideos } from '../../lib/present-video';
import { run } from '../../lib/run';
import { withSpinner } from '../../lib/spinner';

run(async () => {
  const { videos } = await withSpinner('Generating video...', () =>
    generateVideo({
      model: siftq.video(),
      prompt: 'Move smoothly from the opening composition to the final frame',
      frameImages: [
        {
          frameType: 'first_frame',
          image: 'https://example.com/first-frame.png',
        },
        {
          frameType: 'last_frame',
          image: 'https://example.com/last-frame.png',
        },
      ],
      duration: 6,
    }),
  );

  await presentVideos(videos);
});
