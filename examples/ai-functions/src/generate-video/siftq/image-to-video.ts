import { siftq } from '@ai-sdk/siftq';
import { experimental_generateVideo as generateVideo } from 'ai';
import { presentVideos } from '../../lib/present-video';
import { run } from '../../lib/run';
import { withSpinner } from '../../lib/spinner';

run(async () => {
  const { videos } = await withSpinner('Generating video...', () =>
    generateVideo({
      model: siftq.video(),
      prompt: {
        image: 'https://example.com/first-frame.png',
        text: 'The camera slowly moves forward while the lanterns flicker',
      },
      duration: 6,
    }),
  );

  await presentVideos(videos);
});
