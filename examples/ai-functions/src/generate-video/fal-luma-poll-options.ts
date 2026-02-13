import { type FalVideoModelOptions, fal } from '@ai-sdk/fal';
import { experimental_generateVideo } from 'ai';
import { presentVideos } from '../lib/present-video';
import { run } from '../lib/run';

run(async () => {
  process.stdout.write('Generating video ...');
  const { videos } = await experimental_generateVideo({
    model: fal.video('luma-dream-machine/ray-2'),
    prompt:
      'An echidna looking out at San Francisco Bay at sunrise from Crissy Field.',
    aspectRatio: '16:9',
    duration: 5,
    providerOptions: {
      fal: {
        resolution: '540p',
      } satisfies FalVideoModelOptions,
    },
    poll: {
      intervalMs: 1000,
      backoff: 'none',
      timeoutMs: 60_000,
      onAttempt(options) {
        process.stdout.write('.');
      },
    },
  });

  console.log('\nVideo generation complete!');
  await presentVideos(videos);
});
