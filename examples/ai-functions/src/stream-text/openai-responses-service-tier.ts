import { openai, OpenaiResponsesProviderMetadata } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { run } from '../lib/run';

run(async () => {
  const result = streamText({
    model: openai('gpt-5-nano'),
    prompt: 'What color is the sky in one word?',
    providerOptions: {
      openai: {
        serviceTier: 'flex',
      },
    },
  });

  await result.consumeStream();
  const providerMetadata = await (result.providerMetadata as Promise<
    OpenaiResponsesProviderMetadata | undefined
  >);

  if (!providerMetadata) return;
  const {
    openai: { responseId, serviceTier },
  } = providerMetadata;

  responseId && console.log(`responseId: ${responseId}`);
  serviceTier && console.log(`serviceTier: ${serviceTier}`);
});
