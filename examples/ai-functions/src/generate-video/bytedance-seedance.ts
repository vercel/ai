import { createByteDance } from '@ai-sdk/bytedance';
import { experimental_generateVideo } from 'ai';
import { presentVideos } from '../lib/present-video';
import { run } from '../lib/run';
import { withSpinner } from '../lib/spinner';

// Seedance model endpoint IDs
const MODELS = {
  'seedance-1.5-pro': 'ep-20260125152958-7c9gf',
  'seedance-1.0-pro': 'ep-20260125153237-hkvb4',
  'seedance-1.0-pro-fast': 'ep-20260127025001-mgjjl',
  'seedance-1.0-lite-t2v': 'ep-20260127025543-bssxc',
};

run(async () => {
  const byteDance = createByteDance({
    apiKey: process.env.BYTEDANCE_ARK_API_KEY,
  });

  const { video } = await withSpinner('Generating video with Seedance...', () =>
    experimental_generateVideo({
      model: byteDance.video(MODELS['seedance-1.5-pro']),
      prompt: 'A cute cat playing with a ball of yarn in a sunny living room',
      aspectRatio: '16:9',
      duration: 5,
    }),
  );

  await presentVideos([video]);
});
