import { google } from '@ai-sdk/google';
import { experimental_generateVideo } from 'ai';
import { presentVideos } from '../lib/present-video';
import { run } from '../lib/run';

run(async () => {
  const { video } = await experimental_generateVideo({
    model: google.video('veo-3.1-generate-preview'),
    prompt:
      'An echidna looking out at San Francisco Bay at sunset from Crissy Field.',
    aspectRatio: '16:9',
    duration: 6,
  });

  await presentVideos([video]);
});
