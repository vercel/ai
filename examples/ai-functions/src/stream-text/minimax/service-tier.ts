import { minimax, type MiniMaxLanguageModelOptions } from '@ai-sdk/minimax';
import { streamText } from 'ai';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';

// 'priority' requests priority admission at 1.5x the standard price; omit the
// option (or pass 'standard') for the default tier. The applied tier comes
// back as providerMetadata.minimax.serviceTier (also visible as service_tier
// in the raw message_start chunk).
run(async () => {
  const result = streamText({
    model: minimax('minimax-m3'),
    prompt: 'Invent a new holiday and describe its traditions.',
    providerOptions: {
      minimax: {
        serviceTier: 'priority',
      } satisfies MiniMaxLanguageModelOptions,
    },
    include: {
      rawChunks: true,
    },
  });

  await printFullStream({ result });

  console.log('Token usage:', await result.usage);
  console.log('Finish reason:', await result.finishReason);
  console.log(
    'Service tier:',
    (await result.providerMetadata)?.minimax?.serviceTier,
  );
  console.log('Provider metadata:', await result.providerMetadata);
  console.log('Response:', await result.response);
});
