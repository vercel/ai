import { heygen, type HeyGenVideoModelOptions } from '@ai-sdk/heygen';
import { experimental_generateVideo as generateVideo } from 'ai';
import { readFile } from 'node:fs/promises';
import { presentVideos } from '../../lib/present-video';
import { run } from '../../lib/run';
import { withSpinner } from '../../lib/spinner';

run(async () => {
  const { videos } = await withSpinner(
    'Animating the first frame with HeyGen...',
    async () =>
      generateVideo({
        model: heygen.video('heygen-video-1'),
        prompt: {
          text: 'The subject moves slowly. Preserve the composition and natural lighting. Quiet ambient sound, no music.',
          image: await readFile('data/comic-cat.png'),
        },
        duration: 5,
        providerOptions: {
          heygen: {
            resolution: '768p',
            promptEnhancement: 'disabled',
          } satisfies HeyGenVideoModelOptions,
        },
      }),
  );
  await presentVideos(videos);
});
