import { google } from '@ai-sdk/google';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  // The deep-research agent runs a multi-step research workflow on the
  // server. Expect this call to take a while (often a minute or more).
  const result = await generateText({
    model: google.interactions({
      agent: 'deep-research-pro-preview-12-2025',
    }),
    prompt:
      'Briefly summarize the most-cited papers on retrieval-augmented generation since 2024 (2-3 sentences).',
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
