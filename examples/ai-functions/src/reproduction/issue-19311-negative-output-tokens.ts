import { convertAlibabaUsage } from '../../../../packages/alibaba/src/convert-alibaba-usage';
import {
  addLanguageModelUsage,
  asLanguageModelUsage,
  createNullLanguageModelUsage,
} from '../../../../packages/ai/src/types/usage';
import { convertDeepSeekUsage } from '../../../../packages/deepseek/src/chat/convert-to-deepseek-usage';
import { convertGroqUsage } from '../../../../packages/groq/src/convert-groq-usage';
import { convertMoonshotAIChatUsage } from '../../../../packages/moonshotai/src/convert-moonshotai-chat-usage';
import { convertOpenAICompatibleChatUsage } from '../../../../packages/openai-compatible/src/chat/convert-openai-compatible-chat-usage';
import { convertOpenAIChatUsage } from '../../../../packages/openai/src/chat/convert-openai-chat-usage';
import { convertPerplexityUsage } from '../../../../packages/perplexity/src/convert-perplexity-usage';

async function main() {
  const openAIShape = {
    prompt_tokens: 951,
    completion_tokens: 6000,
    total_tokens: 6952,
    prompt_tokens_details: { cached_tokens: 60 },
    completion_tokens_details: { reasoning_tokens: 6001 },
  };

  const converted = {
    openai: convertOpenAIChatUsage(openAIShape),
    groq: convertGroqUsage(openAIShape),
    alibaba: convertAlibabaUsage(openAIShape),
    moonshotai: convertMoonshotAIChatUsage(openAIShape),
    deepseek: convertDeepSeekUsage(openAIShape),
    perplexity: convertPerplexityUsage({
      prompt_tokens: 951,
      completion_tokens: 6000,
      reasoning_tokens: 6001,
    }),
    'openai-compatible': convertOpenAICompatibleChatUsage(openAIShape),
  };

  const textTokens = Object.fromEntries(
    Object.entries(converted).map(([provider, usage]) => [
      provider,
      usage.outputTokens.text,
    ]),
  );

  const aggregated = addLanguageModelUsage(
    createNullLanguageModelUsage(),
    asLanguageModelUsage(converted.openai),
  );

  console.log(
    JSON.stringify(
      {
        outputTextTokens: textTokens,
        aggregatedOutputTextTokens: aggregated.outputTokenDetails.textTokens,
      },
      null,
      2,
    ),
  );

  const nonNumeric = Object.entries(textTokens)
    .filter(([, value]) => typeof value !== 'number')
    .map(([provider]) => provider);

  if (nonNumeric.length > 0) {
    throw new Error(
      `REPRODUCTION_SETUP_FAILED: missing numeric text token counts for ${nonNumeric.join(', ')}`,
    );
  }

  const negativeProviders = Object.entries(textTokens)
    .filter(([, value]) => (value as number) < 0)
    .map(([provider]) => provider);

  if (
    negativeProviders.length > 0 ||
    (aggregated.outputTokenDetails.textTokens ?? 0) < 0
  ) {
    throw new Error(
      `ISSUE_19311_REPRODUCED: negative output text token counts from ${negativeProviders.join(', ')}; aggregated=${aggregated.outputTokenDetails.textTokens}`,
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
