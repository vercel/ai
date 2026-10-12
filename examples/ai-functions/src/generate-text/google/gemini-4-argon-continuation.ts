import { google } from '@ai-sdk/google';
import { generateText } from 'ai';
import { run } from '../../lib/run';

// Long decode: when a response uses up its `maxOutputTokens` budget it stops
// with `length` (MAX_TOKENS) and the provider returns a continuation token.
// Resend the original prompt with the token and a higher `maxOutputTokens`
// (the budget is cumulative across requests) to resume.
run(async () => {
  const prompt = 'Prove that sqrt(2) is irrational, in detail.';

  let text = '';
  let continuationToken: string | undefined;
  let maxOutputTokens = 300;

  for (let hop = 1; hop <= 3; hop++) {
    const result = await generateText({
      model: google('gemini-4-argon'),
      prompt,
      maxOutputTokens,
      providerOptions: { google: { continuationToken } },
    });

    text += result.text;
    console.log(
      `hop ${hop}: ${result.finishReason}, +${result.usage.outputTokens} output tokens`,
    );

    const next = result.finalStep.providerMetadata?.google?.continuationToken;
    if (result.finishReason !== 'length' || typeof next !== 'string') {
      break;
    }

    continuationToken = next;
    maxOutputTokens += 300;
  }

  console.log();
  console.log(text);
});
