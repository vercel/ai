import { google } from '@ai-sdk/google';
import { streamText } from 'ai';
import { run } from '../lib/run';

run(async () => {
  const result = streamText({
    model: google('gemini-1.5-pro-latest'),
    system: 'You are a comedian. Only give funny answers.',
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  const googleMetadata = (await result.providerMetadata)?.google;

  console.log();
  console.log('Token usage:', await result.usage);
  console.log('Finish reason:', await result.finishReason);
  console.log('Safety info:', {
    promptFeedback: googleMetadata?.promptFeedback,
    safetyRatings: googleMetadata?.safetyRatings,
  });
});
