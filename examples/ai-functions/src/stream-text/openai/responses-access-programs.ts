import {
  openai,
  type OpenAILanguageModelResponsesOptions,
  type OpenaiResponsesProviderMetadata,
} from '@ai-sdk/openai';
import { streamText } from 'ai';
import { run } from '../../lib/run';

// Requires OPENAI_API_KEY from a project with Daybreak Blue enabled.
// See https://developers.openai.com/api/docs/guides/daybreak
run(async () => {
  const result = streamText({
    model: openai.responses('gpt-6-sol'),
    prompt: 'Explain how to validate a security patch in a test environment.',
    providerOptions: {
      openai: {
        accessPrograms: { cyber: 'daybreak_blue' },
      } satisfies OpenAILanguageModelResponsesOptions,
    },
  });

  for await (const textDelta of result.textStream) {
    process.stdout.write(textDelta);
  }
  console.log();

  const metadata = (await result.finalStep).providerMetadata as
    | OpenaiResponsesProviderMetadata
    | undefined;

  console.log('Applied access programs:', metadata?.openai.accessPrograms);
});
