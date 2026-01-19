import { vertex } from '@ai-sdk/google-vertex';
import { experimental_generateVideo } from 'ai';
import { presentVideos } from '../lib/present-video';
import { run } from '../lib/run';

run(async () => {
  const { video } = await experimental_generateVideo({
    model: vertex.video('veo-002'),
    prompt: 'A time-lapse of a city skyline transitioning from day to night',
    aspectRatio: '16:9',
    resolution: '1920x1080',
    duration: 8,
  });

  await presentVideos([video]);
});
