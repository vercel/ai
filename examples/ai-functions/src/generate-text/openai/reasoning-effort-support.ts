import {
  openai,
  type OpenAILanguageModelResponsesOptions,
} from '@ai-sdk/openai';
import { APICallError, generateText } from 'ai';
import { run } from '../../lib/run';

const allEfforts = [
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
] as const;

// Reasoning efforts that the OpenAI model catalog declares for each model.
// Every other effort is sent to the API below to check that it is rejected.
const declaredEfforts: Record<string, readonly string[]> = {
  o1: ['low', 'medium', 'high'],
  'o1-2024-12-17': ['low', 'medium', 'high'],
  o3: ['low', 'medium', 'high'],
  'o3-2025-04-16': ['low', 'medium', 'high'],
  'o3-mini': ['low', 'medium', 'high'],
  'o3-mini-2025-01-31': ['low', 'medium', 'high'],
  'o4-mini': ['low', 'medium', 'high'],
  'o4-mini-2025-04-16': ['low', 'medium', 'high'],
  'gpt-5-pro': ['high'],
  'gpt-5-pro-2025-10-06': ['high'],
  'gpt-5-codex': ['low', 'medium', 'high'],
  'gpt-5.1-codex': ['none', 'low', 'medium', 'high'],
  'gpt-5.1-codex-mini': ['none', 'low', 'medium', 'high'],
  'gpt-5.1-codex-max': ['none', 'low', 'medium', 'high', 'xhigh'],
  'gpt-5.1-chat-latest': ['medium'],
  'gpt-5.2-codex': ['low', 'medium', 'high', 'xhigh'],
  'gpt-5.2-pro': ['medium', 'high', 'xhigh'],
  'gpt-5.2-pro-2025-12-11': ['medium', 'high', 'xhigh'],
  'gpt-5.2-chat-latest': ['medium'],
  'gpt-5.3-codex': ['low', 'medium', 'high', 'xhigh'],
  'gpt-5.3-chat-latest': ['medium'],
  'gpt-5.4-pro': ['medium', 'high', 'xhigh'],
  'gpt-5.4-pro-2026-03-05': ['medium', 'high', 'xhigh'],
};

run(async () => {
  const accepted: string[] = [];
  const inconclusive: string[] = [];

  for (const [modelId, declared] of Object.entries(declaredEfforts)) {
    console.log(`\n${modelId} (declared: ${declared.join(', ')})`);

    for (const effort of allEfforts.filter(e => !declared.includes(e))) {
      try {
        await generateText({
          model: openai.responses(modelId),
          prompt: 'Reply with the word "ok".',
          // Keep accepted calls cheap. A truncated response still counts.
          maxOutputTokens: 16,
          maxRetries: 0,
          providerOptions: {
            openai: {
              // The provider option is sent to the API unchanged, unlike the
              // top-level `reasoning` setting, which maps to a declared effort.
              reasoningEffort: effort,
              reasoningSummary: null,
            } satisfies OpenAILanguageModelResponsesOptions,
          },
        });

        accepted.push(`${modelId}: ${effort}`);
        console.log(`  ${effort}: ACCEPTED (the catalog should declare it)`);
      } catch (error) {
        const status = APICallError.isInstance(error)
          ? error.statusCode
          : undefined;
        const message = error instanceof Error ? error.message : String(error);

        // A 400 that names the reasoning effort is the expected rejection.
        // Anything else (no model access, rate limit) proves nothing.
        if (status === 400 && /reasoning|effort/i.test(message)) {
          console.log(`  ${effort}: rejected (${message})`);
        } else {
          inconclusive.push(`${modelId}: ${effort}`);
          console.log(
            `  ${effort}: INCONCLUSIVE (${status ?? 'error'}: ${message})`,
          );
        }
      }
    }
  }

  console.log('\nOmitted efforts that the API accepted:');
  console.log(accepted.length > 0 ? accepted.join('\n') : 'none');
  console.log('\nInconclusive (failed for another reason):');
  console.log(inconclusive.length > 0 ? inconclusive.join('\n') : 'none');
});
