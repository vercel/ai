import { readFileSync } from 'node:fs';
import { prodia } from '@ai-sdk/prodia';
import { experimental_generateVideo as generateVideo } from 'ai';
import { presentVideos } from '../../lib/present-video';
import { run } from '../../lib/run';
import { withSpinner } from '../../lib/spinner';

run(async () => {
  const { videos } = await withSpinner('Generating H3 fast video...', () =>
    generateVideo({
      model: prodia.video('inference.minimax.h3.fast.img2vid.v1'),
      prompt: 'The scene comes to life, camera slowly pushing in',
      frameImages: [
        { frameType: 'first_frame', image: readFileSync('data/comic-cat.png') },
        { frameType: 'last_frame', image: readFileSync('data/comic-cat.png') },
      ],
      duration: 4,
    }),
  );
  await presentVideos(videos);
});
