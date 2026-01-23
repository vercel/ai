import { google } from '@ai-sdk/google';
import { experimental_generateVideo } from 'ai';
import { presentVideos } from '../lib/present-video';
import { run } from '../lib/run';
import { withSpinner } from '../lib/spinner';

run(async () => {
  const { video } = await withSpinner('Generating video...', () =>
    experimental_generateVideo({
      model: google.video('veo-3.1-generate-preview'),
      prompt: 'A kitchen of vercelians cooking up ai agents',
      // prompt: 'Twilight Sparkle from My Little Pony having a candlelight dinner with a friend pony at the Marina Green in San Francisco on a foggy day.',
      // prompt: 'Twilight Sparkle from My Little Pony with a friend pony at the Marina Green in San Francisco on a foggy day being consoled after receiving surprising news.',
      // prompt: 'Twilight Sparkle from My Little Pony having a picnic with her other pony friends at the Marina Green in San Francisco on a sunny day.',
      // prompt: 'A battle between Pikachu and Ultraman in San Francisco Bay with Alcatraz in the background with a lighthouse at night.',
      // prompt: 'A blue cream Persian cat lounging in front of a fire in Sweden.',
      aspectRatio: '16:9',
      duration: 6,
    }),
  );

  await presentVideos([video]);
});
