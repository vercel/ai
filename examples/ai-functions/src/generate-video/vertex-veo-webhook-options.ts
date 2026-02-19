import {
  type GoogleVertexVideoModelOptions,
  vertex,
} from '@ai-sdk/google-vertex';
import { experimental_generateVideo as generateVideo } from 'ai';
import { presentVideos } from '../lib/present-video';
import { run } from '../lib/run';
import { withSpinner } from '../lib/spinner';

// Note: Requires GOOGLE_VERTEX_LOCATION to be set to a specific region (e.g., us-central1)
// Veo models are not available in the 'global' region
// Note: Vertex does not support webhooks natively. The SDK will log an
// unsupported-webhook warning and automatically fall back to polling.
run(async () => {
  const { video, warnings } = await withSpinner('Generating video...', () =>
    generateVideo({
      model: vertex.video('veo-3.1-fast-generate-001'),
      prompt: 'A salamander in a forest pond at dusk with luminescent algae.',
      aspectRatio: '16:9',
      resolution: '1920x1080',
      duration: 8,
      providerOptions: {
        vertex: {
          pollTimeoutMs: 600000, // 10 minutes
        } satisfies GoogleVertexVideoModelOptions,
      },
      webhook: async () => {
        throw new Error(
          'Webhooks are not supported by Vertex. This callback should not be invoked',
        );
      },
    }),
  );

  if (warnings?.length) {
    console.warn('\nWarnings:', warnings);
  }

  await presentVideos([video]);
});
