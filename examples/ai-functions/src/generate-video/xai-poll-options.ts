import { type XaiVideoModelOptions, xai } from '@ai-sdk/xai';
import { experimental_generateVideo as generateVideo } from 'ai';
import { presentVideos } from '../lib/present-video';
import { run } from '../lib/run';

run(async () => {
  process.stdout.write('Generating video ...');
  const startTime = Date.now();
  const { videos } = await generateVideo({
    model: xai.video('grok-imagine-video'),
    prompt: 'A yorkie among dandelions at Crissy Field in San Francisco.',
    aspectRatio: '16:9',
    duration: 5,
    providerOptions: {
      xai: {
        pollTimeoutMs: 600000, // 10 minutes
      } satisfies XaiVideoModelOptions,
    },
    poll: {
      intervalMs: 1000,
      backoff: 'none',
      timeoutMs: 60_000,
      onAttempt() {
        process.stdout.write('.');
      },
    },
  });

  const elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nVideo generation complete in ${elapsedSeconds}s`);
  await presentVideos(videos);
});
