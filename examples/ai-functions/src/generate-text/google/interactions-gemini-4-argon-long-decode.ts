import { google } from '@ai-sdk/google';
import { generateText } from 'ai';
import { run } from '../../lib/run';

// Long decode with the Interactions API requires `background: true` and an
// explicit `maxOutputTokens` above 65,536. The server runs every request
// itself; the provider polls the interaction until it finishes.
run(async () => {
  const result = await generateText({
    model: google.interactions('gemini-4-argon'),
    prompt:
      'Write a detailed, chapter-by-chapter technical guide to building a relational database from scratch.',
    maxOutputTokens: 200_000,
    providerOptions: {
      google: { background: true, pollingTimeoutMs: 60 * 60 * 1000 },
    },
  });

  console.log(result.text);
  console.log();
  console.log('Token usage:', result.usage);
  console.log('Finish reason:', result.finishReason);
  console.log(
    'Interaction id:',
    result.finalStep.providerMetadata?.google?.interactionId,
  );
});
