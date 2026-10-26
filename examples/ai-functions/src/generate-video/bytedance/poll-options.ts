import { byteDance } from '@ai-sdk/bytedance';
import { experimental_generateVideo as generateVideo } from 'ai';
import { presentVideos } from '../../lib/present-video';
import { run } from '../../lib/run';
import { withSpinner } from '../../lib/spinner';

run(async () => {
  const { video } = await withSpinner(
    'Generating video with custom poll settings...',
    () =>
      generateVideo({
        model: byteDance.video('seedance-1-0-pro-250528'),
        prompt:
          'A chicken flying into the sunset over a field of daisies, in the style of 90s anime.',
        aspectRatio: '16:9',
        duration: 5,
        // ByteDance video generation is task-based: the provider creates the
        // task and the AI SDK polls it. Polling is configured here rather than
        // through `providerOptions.bytedance` (the legacy `pollIntervalMs` /
        // `pollTimeoutMs` provider options are ignored).
        poll: {
          intervalMs: 2000, // default: 5000
          timeoutMs: 900_000, // 15 minutes; default: 600000 (10 minutes)
        },
      }),
  );

  await presentVideos([video]);
});
