import { google } from '@ai-sdk/google';
import { streamText } from 'ai';
import { cancelOnSigint } from '../../lib/cancel-on-sigint';
import { run } from '../../lib/run';

/*
 * Streams a deep-research agent run with thinking summaries enabled. Because
 * the SDK uses the API's real SSE feed (`GET /interactions/{id}?stream=true`)
 * for background calls, reasoning deltas and text deltas arrive incrementally
 * as the agent makes progress -- watch the `[thinking]` and final-answer
 * sections fill in over the course of the run rather than appearing all at
 * once at the end.
 */
run(async () => {
  // Ctrl+C aborts the stream, which fires `POST /interactions/{id}/cancel`
  // on Google's side so the agent stops billing instead of running to
  // completion in the background.
  const ac = cancelOnSigint();

  const result = streamText({
    model: google.interactions({
      agent: 'deep-research-pro-preview-12-2025',
    }),
    providerOptions: {
      google: {
        agentConfig: {
          type: 'deep-research',
          thinkingSummaries: 'auto',
        },
      },
    },
    prompt:
      'Briefly summarize the most-cited papers on retrieval-augmented generation since 2024 (2-3 sentences).',
    abortSignal: ac.signal,
  });

  for await (const part of result.fullStream) {
    if (part.type === 'reasoning-delta') {
      process.stdout.write(`\x1b[2m${part.text}\x1b[0m`);
    } else if (part.type === 'text-delta') {
      process.stdout.write(part.text);
    }
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
