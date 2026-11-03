import { google } from '@ai-sdk/google';
import { streamText } from 'ai';
import { run } from '../../lib/run';

// Long decode with the Interactions API in the foreground (client-side
// continuation): a single streaming request generates at most 64K tokens.
// With a `maxOutputTokens` budget above 65,536, the provider sends the
// follow-up requests (hops) itself and streams them as one response.
run(async () => {
  const result = streamText({
    model: google.interactions('gemini-4-argon'),
    prompt:
      'Write a detailed, chapter-by-chapter technical guide to building a relational database from scratch.',
    maxOutputTokens: 200_000,
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  const googleMetadata = (await result.finalStep).providerMetadata?.google;

  console.log();
  console.log('Token usage:', await result.usage);
  console.log('Initial input tokens:', googleMetadata?.initialInputTokens);
  console.log('Finish reason:', await result.finishReason);
  console.log('Interaction id:', googleMetadata?.interactionId);
});
