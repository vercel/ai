import {
  openai,
  type OpenAILanguageModelResponsesOptions,
  type OpenaiResponsesProviderMetadata,
} from '@ai-sdk/openai';
import { generateText } from 'ai';
import { run } from '../../lib/run';

// Requires OPENAI_API_KEY from a project with Daybreak Blue enabled.
// See https://developers.openai.com/api/docs/guides/daybreak
run(async () => {
  const result = await generateText({
    model: openai.responses('gpt-6-sol'),
    prompt: 'Explain how to validate a security patch in a test environment.',
    providerOptions: {
      openai: {
        accessPrograms: { cyber: 'daybreak_blue' },
      } satisfies OpenAILanguageModelResponsesOptions,
    },
  });

  const metadata = result.finalStep.providerMetadata as
    | OpenaiResponsesProviderMetadata
    | undefined;

  console.log(result.text);
  console.log();
  console.log('Applied access programs:', metadata?.openai.accessPrograms);
});
