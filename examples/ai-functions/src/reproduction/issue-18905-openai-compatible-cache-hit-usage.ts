import { convertOpenAICompatibleChatUsage } from '@ai-sdk/openai-compatible/internal';

async function main() {
  const topLevelOnlyUsage = {
    prompt_tokens: 100,
    completion_tokens: 20,
    prompt_cache_hit_tokens: 40,
  };

  const normalized = convertOpenAICompatibleChatUsage(topLevelOnlyUsage);

  console.log(JSON.stringify(normalized, null, 2));

  if (normalized.inputTokens.total !== 100) {
    throw new Error('Expected total input tokens to remain 100.');
  }

  if (
    normalized.inputTokens.cacheRead !== 40 ||
    normalized.inputTokens.noCache !== 60
  ) {
    throw new Error(
      'ISSUE_18905_REPRODUCED: top-level prompt_cache_hit_tokens was not normalized as cached input.',
    );
  }

  const nestedFieldTakesPrecedence = convertOpenAICompatibleChatUsage({
    ...topLevelOnlyUsage,
    prompt_tokens_details: { cached_tokens: 25 },
  });

  if (
    nestedFieldTakesPrecedence.inputTokens.cacheRead !== 25 ||
    nestedFieldTakesPrecedence.inputTokens.noCache !== 75
  ) {
    throw new Error(
      'Expected prompt_tokens_details.cached_tokens to take precedence over the top-level fallback.',
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
