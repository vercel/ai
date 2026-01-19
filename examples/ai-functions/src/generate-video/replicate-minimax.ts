import { replicate } from '@ai-sdk/replicate';
import { experimental_generateVideo } from 'ai';
import { presentVideos } from '../lib/present-video';
import { run } from '../lib/run';

run(async () => {
  const { video } = await experimental_generateVideo({
    model: replicate.video('minimax/video-01'),
    prompt:
      'A pink robin at sunrise on Telegraph Hill looking out at Alcatraz.',
    aspectRatio: '16:9',
  });

  await presentVideos([video]);
});
