import { fal } from '@ai-sdk/fal';
import { experimental_generateVideo } from 'ai';
import { presentVideos } from '../lib/present-video';
import { run } from '../lib/run';

run(async () => {
  const { videos } = await experimental_generateVideo({
    model: fal.video('luma-dream-machine'),
    prompt:
      'An echidna looking out at San Francisco Bay at sunset from Crissy Field.',
    aspectRatio: '16:9',
    duration: 5,
  });

  await presentVideos(videos);
});
