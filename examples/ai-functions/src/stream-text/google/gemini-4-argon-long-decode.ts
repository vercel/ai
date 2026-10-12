import { google } from '@ai-sdk/google';
import { streamText } from 'ai';
import { run } from '../../lib/run';

// Long decode: a single streaming request generates at most 64K tokens. With
// a higher `maxOutputTokens` budget, the provider continues the response
// automatically with follow-up requests until it finishes or the budget is
// used up.
run(async () => {
  const result = streamText({
    model: google('gemini-4-argon'),
    prompt:
      'Write a detailed, chapter-by-chapter technical guide to building a relational database from scratch.',
    maxOutputTokens: 200_000,
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  console.log();
  // Summed across all requests (matches billing).
  console.log('Token usage:', await result.usage);
  // Prompt tokens of the first request, for context window checks.
  console.log(
    'Initial prompt tokens:',
    (await result.finalStep).providerMetadata?.google?.initialPromptTokenCount,
  );
  console.log('Finish reason:', await result.finishReason);
});
