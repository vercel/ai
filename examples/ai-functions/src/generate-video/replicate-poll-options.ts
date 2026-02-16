import { type ReplicateVideoModelOptions, replicate } from '@ai-sdk/replicate';
import { experimental_generateVideo } from 'ai';
import { presentVideos } from '../lib/present-video';
import { run } from '../lib/run';

run(async () => {
  process.stdout.write('Generating video ...');
  const { video } = await experimental_generateVideo({
    model: replicate.video('minimax/video-01'),
    prompt: 'A bumblebee on a dandelion in Bali surrounded by pollen dust.',
    aspectRatio: '16:9',
    providerOptions: {
      replicate: {
        pollTimeoutMs: 600000, // 10 minutes
      } satisfies ReplicateVideoModelOptions,
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
  await presentVideos([video]);
});
