import { replicate } from '@ai-sdk/replicate';
import { experimental_generateVideo } from 'ai';
import { presentVideos } from '../lib/present-video';
import { run } from '../lib/run';
import { withSpinner } from '../lib/spinner';

run(async () => {
  const { video } = await withSpinner('Generating video...', () =>
    experimental_generateVideo({
      model: replicate.video('wan-video/wan-2.5-t2v'),
      prompt: 'An expert chocolatier showing how to cut a dragonfruit.',
      aspectRatio: '16:9',
      duration: 10,
    }),
  );

  await presentVideos([video]);
});
