import { type ReplicateVideoModelOptions, replicate } from '@ai-sdk/replicate';
import { experimental_generateVideo } from 'ai';
import { presentVideos } from '../lib/present-video';
import { run } from '../lib/run';

run(async () => {
  process.stdout.write('Generating video ...');
  const startTime = Date.now();
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
      timeoutMs: 600_000,
      onAttempt() {
        process.stdout.write('.');
      },
    },
  });

  const elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nVideo generation complete in ${elapsedSeconds}s`);
  await presentVideos([video]);
});
