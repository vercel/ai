import { openai } from '@ai-sdk/openai';
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
  const providerMetadata = await result.providerMetadata;

  console.log('Provider metadata:', providerMetadata);
  // Provider metadata: {
  //   openai: {
  //     responseId: '...',
  //     serviceTier: 'flex'
  //   }
  // }
});
