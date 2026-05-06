import { google } from '@ai-sdk/google';
import { streamText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  // Turn 1: ask the deep-research agent to identify key topics. Default
  // `store: true` keeps server-side context so we can chain via
  // `previousInteractionId`. Note: agent calls can be slow.
  console.log('--- Turn 1 ---');
  const turn1 = streamText({
    model: google.interactions({
      agent: 'deep-research-pro-preview-12-2025',
    }),
    prompt:
      'List three foundational concepts behind transformer-based language models (one sentence each).',
  });
  for await (const textPart of turn1.textStream) {
    process.stdout.write(textPart);
  }
  console.log();

  const interactionId = (await turn1.providerMetadata)?.google?.interactionId as
    | string
    | undefined;
  console.log();
  console.log('Interaction id (turn 1):', interactionId);
  console.log();

  if (interactionId == null) {
    throw new Error('Turn 1 did not return an interaction id.');
  }

  // Turn 2: send ONLY the new user message + previousInteractionId. The
  // server pulls the prior agent context from its own state — no message
  // history needs to be re-sent.
  console.log('--- Turn 2 ---');
  const turn2 = streamText({
    model: google.interactions({
      agent: 'deep-research-pro-preview-12-2025',
    }),
    prompt:
      'Of those three, which one was the most novel contribution at the time? Answer in 1-2 sentences.',
    providerOptions: {
      google: { previousInteractionId: interactionId },
    },
  });
  for await (const textPart of turn2.textStream) {
    process.stdout.write(textPart);
  }
  console.log();
  console.log();
  console.log(
    'Interaction id (turn 2):',
    (await turn2.providerMetadata)?.google?.interactionId,
  );
});
