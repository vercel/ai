import { byteDance } from '@ai-sdk/bytedance';
import { experimental_generateVideo } from 'ai';
import { presentVideos } from '../lib/present-video';
import { run } from '../lib/run';
import { withSpinner } from '../lib/spinner';

run(async () => {
  const { video } = await withSpinner('Generating video...', () =>
    experimental_generateVideo({
      model: byteDance.video(process.env.BYTEDANCE_SEEDANCE_ENDPOINT_ID!),
      prompt: 'A golden bamboo lemur jumping between trees in a lush forest.',
      aspectRatio: '16:9',
      duration: 5,
      providerOptions: {
        bytedance: {
          pollTimeoutMs: 600000,
        },
      },
    }),
  );

  await presentVideos([video]);
});
