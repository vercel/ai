import { minimax } from '@ai-sdk/minimax';
import { parseJSON } from '@ai-sdk/provider-utils';
import { run } from '../../lib/run';

// From examples/ai-functions, with MINIMAX_API_KEY configured:
// Start:  pnpm tsx src/generate-video/minimax/start-status.ts
// Status: pnpm tsx src/generate-video/minimax/start-status.ts '<operation JSON>'
// Each invocation makes one API request. Repeat status later if still pending.
run(async () => {
  const model = minimax.video('MiniMax-H3');
  if (model.doStart == null || model.doStatus == null) {
    throw new Error('This model does not support start/status.');
  }

  const serializedOperation = process.argv[2];
  if (serializedOperation != null) {
    const result = await model.doStatus({
      operation: await parseJSON({ text: serializedOperation }),
    });
    console.log(result);
    return;
  }

  const { operation, warnings } = await model.doStart({
    prompt: 'A white kitten chases a butterfly across a sunlit garden.',
    n: 1,
    aspectRatio: '16:9',
    duration: 5,
    resolution: undefined,
    fps: undefined,
    seed: undefined,
    image: undefined,
    frameImages: undefined,
    inputReferences: undefined,
    generateAudio: undefined,
    providerOptions: { minimax: { resolution: '768P' } },
  });

  console.log('Operation JSON (persist the entire value for status checks):');
  console.log(JSON.stringify(operation));
  console.log('Warnings:', warnings);
});
