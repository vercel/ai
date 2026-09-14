import { minimax } from '@ai-sdk/minimax';
import { parseJSON } from '@ai-sdk/provider-utils';
import {
  experimental_getVideoStatus as getVideoStatus,
  experimental_startVideo as startVideo,
} from 'ai';
import { run } from '../../lib/run';

// From examples/ai-functions, with MINIMAX_API_KEY configured:
// Start:  pnpm tsx src/generate-video/minimax/start-status.ts
// Status: pnpm tsx src/generate-video/minimax/start-status.ts '<operation JSON>'
// Each invocation makes one API request. Repeat status later if still pending.
run(async () => {
  const model = minimax.video('MiniMax-H3');
  const serializedOperation = process.argv[2];
  if (serializedOperation != null) {
    const result = await getVideoStatus(model, {
      operation: await parseJSON({ text: serializedOperation }),
      maxRetries: 0,
    });
    console.log(result);
    return;
  }

  const { operation, warnings } = await startVideo({
    model,
    prompt: 'A white kitten chases a butterfly across a sunlit garden.',
    aspectRatio: '16:9',
    duration: 5,
    maxRetries: 0,
    providerOptions: { minimax: { resolution: '768P' } },
  });

  console.log('Operation JSON (persist the entire value for status checks):');
  console.log(JSON.stringify(operation));
  console.log('Warnings:', warnings);
});
