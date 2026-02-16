import { type GoogleVideoModelOptions, google } from '@ai-sdk/google';
import { experimental_generateVideo } from 'ai';
import { presentVideos } from '../lib/present-video';
import { run } from '../lib/run';

run(async () => {
  process.stdout.write('Generating video ...');
  const { video } = await experimental_generateVideo({
    model: google.video('veo-3.1-generate-preview'),
    prompt: 'A Bedlington Terrier leaping at Crissy Field at sunset.',
    aspectRatio: '16:9',
    duration: 6,
    providerOptions: {
      google: {
        pollTimeoutMs: 600000, // 10 minutes
      } satisfies GoogleVideoModelOptions,
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
