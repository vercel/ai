import { google, type GoogleLanguageModelOptions } from '@ai-sdk/google';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: google('gemini-4-hydrogen'),
    prompt: 'What is AGI?',
    providerOptions: {
      google: {
        thinkingConfig: { thinkingLevel: 'xhigh' },
      } satisfies GoogleLanguageModelOptions,
    },
  });

  console.log(result.text);
  console.log('Token usage:', result.usage);
  console.log('Finish reason:', result.finishReason);
});
