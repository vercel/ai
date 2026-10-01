import { mistral, type MistralLanguageModelChatOptions } from '@ai-sdk/mistral';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const promptCacheKey = 'support-classification-workflow-v1';
  const system = `Classify customer support requests into one of these queues:
- account: sign-in, profile, and account access
- billing: invoices, refunds, and payment methods
- technical: errors, performance, and product behavior
- feedback: feature requests and general product feedback

Return only the queue name. Apply these rules consistently across every
request in this workflow. Prefer technical when a request describes unexpected
product behavior, even if the behavior affects an account or payment flow.`;

  for (const prompt of [
    'The dashboard shows an error whenever I open my latest invoice.',
    'Please add keyboard shortcuts to the editor.',
  ]) {
    const result = await generateText({
      model: mistral('mistral-medium-3.5'),
      system,
      prompt,
      maxOutputTokens: 10,
      reasoning: 'none',
      providerOptions: {
        mistral: {
          promptCacheKey,
        } satisfies MistralLanguageModelChatOptions,
      },
    });

    console.log(`${prompt}\nQueue: ${result.text}`);
    console.log(
      `Cached input tokens: ${result.usage.inputTokenDetails.cacheReadTokens}\n`,
    );
  }
});
