import { tencent } from '@ai-sdk/tencent';
import { experimental_generateVideo as generateVideo } from 'ai';
import fs from 'node:fs';
import { presentVideos } from '../../lib/present-video';
import { run } from '../../lib/run';
import { withSpinner } from '../../lib/spinner';

run(async () => {
  const { videos } = await withSpinner(
    'Generating Seedance 2.0 first-and-last-frame video through Tencent VOD...',
    () =>
      generateVideo({
        model: tencent.video('vod/VS/2.0'),
        prompt: 'The cartoon cat slowly transforms into a cartoon dog.',
        frameImages: [
          {
            image: fs.readFileSync('data/comic-cat.png'),
            frameType: 'first_frame',
          },
          {
            image: fs.readFileSync('data/comic-dog.png'),
            frameType: 'last_frame',
          },
        ],
        duration: 4,
        resolution: '854x480',
        generateAudio: false,
        providerOptions: { tencent: { pollTimeoutMs: 900000 } },
      }),
  );

  await presentVideos(videos);
});
