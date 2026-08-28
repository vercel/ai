import {
  anthropic,
  type AnthropicLanguageModelOptions,
} from '@ai-sdk/anthropic';
import { streamText } from 'ai';
import { print } from '../../lib/print';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';

// The applied tier comes back as providerMetadata.anthropic.serviceTier (also
// visible as service_tier in the raw message_start chunk).
run(async () => {
  const result = streamText({
    model: anthropic('claude-haiku-4-5'),
    prompt: 'Invent a new holiday and describe its traditions.',
    maxRetries: 0,
    providerOptions: {
      anthropic: {
        serviceTier: 'auto',
      } satisfies AnthropicLanguageModelOptions,
    },
    include: {
      rawChunks: true,
    },
  });

  printFullStream({ result });

  print('Usage:', await result.usage);
  print('Finish reason:', await result.finishReason);
  print(
    'Service tier:',
    (await result.providerMetadata)?.anthropic?.serviceTier,
  );
  print('Provider metadata:', await result.providerMetadata);
  print('Response:', await result.response);

  return result;
});
