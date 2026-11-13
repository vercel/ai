import { google, type GoogleLanguageModelOptions } from '@ai-sdk/google';
import { streamText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = streamText({
    model: google('gemini-4-hydrogen'),
    prompt: 'What is AGI?',
    providerOptions: {
      google: {
        thinkingConfig: { thinkingLevel: 'xhigh' },
      } satisfies GoogleLanguageModelOptions,
    },
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  console.log();
  console.log('Token usage:', await result.usage);
  console.log('Finish reason:', await result.finishReason);
});
