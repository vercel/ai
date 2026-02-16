import { type KlingAIVideoModelOptions, klingai } from '@ai-sdk/klingai';
import { experimental_generateVideo as generateVideo } from 'ai';
import { presentVideos } from '../lib/present-video';
import { run } from '../lib/run';

run(async () => {
  process.stdout.write('Generating video ...');
  const { videos } = await generateVideo({
    model: klingai.video('kling-v2.6-t2v'),
    prompt: 'A chicken flying into the sunset in the style of 90s anime.',
    aspectRatio: '16:9',
    duration: 5,
    providerOptions: {
      klingai: {
        mode: 'std',
        pollTimeoutMs: 600000, // 10 minutes
      } satisfies KlingAIVideoModelOptions,
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
