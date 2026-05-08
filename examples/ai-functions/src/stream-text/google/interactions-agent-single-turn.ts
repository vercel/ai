import { google } from '@ai-sdk/google';
import { streamText } from 'ai';
import { cancelOnSigint } from '../../lib/cancel-on-sigint';
import { run } from '../../lib/run';

run(async () => {
  // Ctrl+C aborts the stream, which fires `POST /interactions/{id}/cancel`
  // on Google's side so the agent stops billing instead of running to
  // completion in the background.
  const ac = cancelOnSigint();

  // The deep-research agent runs a multi-step research workflow on the
  // server. Expect this call to take a while (often a minute or more).
  const result = streamText({
    model: google.interactions({
      agent: 'deep-research-pro-preview-12-2025',
    }),
    prompt:
      'Briefly summarize the most-cited papers on retrieval-augmented generation since 2024 (2-3 sentences).',
    abortSignal: ac.signal,
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
    (await result.providerMetadata)?.google?.interactionId,
  );
});
