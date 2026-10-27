import { minimax, type MiniMaxLanguageModelOptions } from '@ai-sdk/minimax';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: minimax('minimax-m3.1-flash'),
    temperature: 1.5,
    topP: 0.9,
    maxOutputTokens: 16384,
    include: { requestBody: true },
    providerOptions: {
      minimax: {
        thinking: { type: 'adaptive' },
        effort: 'low',
      } satisfies MiniMaxLanguageModelOptions,
    },
    prompt: 'Invent three names for a café on the moon.',
  });

  // Verify temperature: 1.5 and top_p: 0.9 alongside thinking: adaptive.
  console.log('Request body:', result.request.body);
  console.log('Warnings:', result.warnings);
  console.log('Answer:', result.text);
  console.log('Token usage:', result.usage);
});
