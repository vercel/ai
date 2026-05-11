import { google } from '@ai-sdk/google';
import { streamText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  // The deep-research agent runs a multi-step research workflow on the
  // server. Expect this call to take a while (often a minute or more).
  const result = streamText({
    model: google.interactions({
      agent: 'deep-research-pro-preview-12-2025',
    }),
    prompt:
      'Briefly summarize the most-cited papers on retrieval-augmented generation since 2024 (2-3 sentences).',
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }
  console.log();

  console.log();
  console.log('Token usage:', await result.usage);
  console.log('Finish reason:', await result.finishReason);
  console.log(
    'Interaction id:',
    (await result.finalStep).providerMetadata?.google?.interactionId,
  );
});
