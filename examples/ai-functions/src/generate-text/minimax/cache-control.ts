import { minimax, type MiniMaxCacheControlOptions } from '@ai-sdk/minimax';
import { generateText } from 'ai';
import { readFileSync } from 'node:fs';
import { run } from '../../lib/run';

run(async () => {
  const reference = readFileSync('data/error-message.txt', 'utf8');

  for (const question of [
    'Explain this error message.',
    'What should I check first to fix this error?',
  ]) {
    const result = await generateText({
      model: minimax('minimax-m3.1-flash'),
      reasoning: 'low',
      maxOutputTokens: 16384,
      include: { requestBody: true },
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `You are a JavaScript expert. Analyze this error:\n${reference}`,
              providerOptions: {
                minimax: {
                  cacheControl: { type: 'ephemeral' },
                } satisfies MiniMaxCacheControlOptions,
              },
            },
            { type: 'text', text: question },
          ],
        },
      ],
    });

    console.log('Question:', question);
    console.log(
      'Request body:',
      JSON.stringify(result.finalStep.request.body, null, 2),
    );
    console.log('Answer:', result.text);
    console.log('Warnings:', result.warnings);
    // A marker does not guarantee a cache hit on the second request.
    console.log(
      'Cache read tokens:',
      result.usage.inputTokenDetails.cacheReadTokens,
    );
    console.log(
      'Cache write tokens:',
      result.usage.inputTokenDetails.cacheWriteTokens,
    );
  }
});
