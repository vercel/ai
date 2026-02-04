import {
  LanguageModelV3CallOptions,
  LanguageModelV3GenerateResult,
  LanguageModelV3StreamResult,
} from '@ai-sdk/provider';
import { OpenAICompatibleChatLanguageModel } from '@ai-sdk/openai-compatible';
import { FetchFunction } from '@ai-sdk/provider-utils';

type DeepInfraChatConfig = {
  provider: string;
  url: (options: { path: string; modelId?: string }) => string;
  headers: () => Record<string, string | undefined>;
  fetch?: FetchFunction;
};

export class DeepInfraChatLanguageModel extends OpenAICompatibleChatLanguageModel {
  constructor(modelId: string, config: DeepInfraChatConfig) {
    super(modelId, config);
  }

  /**
   * Fixes incorrect token usage for Gemini/Gemma models from DeepInfra.
   *
   * DeepInfra's API returns completion_tokens that are smaller than reasoning_tokens
   * for Gemini/Gemma models, which violates the OpenAI-compatible spec.
   * According to the spec, completion_tokens should include reasoning_tokens.
   *
   * Example of incorrect data from DeepInfra:
   * {
   *   "completion_tokens": 84,
   *   "completion_tokens_details": {
   *     "reasoning_tokens": 1081
   *   }
   * }
   *
   * This would result in negative text tokens: 84 - 1081 = -997
   *
   * The fix: If reasoning_tokens > completion_tokens, set completion_tokens = reasoning_tokens
   */
  private fixUsageForGeminiModels(usage: any): typeof usage {
    if (!usage || !usage.completion_tokens_details?.reasoning_tokens) {
      return usage;
    }

    const completionTokens = usage.completion_tokens ?? 0;
    const reasoningTokens = usage.completion_tokens_details.reasoning_tokens;

    // If reasoning tokens exceed completion tokens, the API data is incorrect
    if (reasoningTokens > completionTokens) {
      return {
        ...usage,
        // Set completion_tokens to reasoning_tokens since all tokens are reasoning tokens
        completion_tokens: reasoningTokens,
        // Update total_tokens if present
        total_tokens:
          usage.total_tokens != null
            ? usage.total_tokens + (reasoningTokens - completionTokens)
            : undefined,
      };
    }

    return usage;
  }

  async doGenerate(
    options: LanguageModelV3CallOptions,
  ): Promise<LanguageModelV3GenerateResult> {
    const result = await super.doGenerate(options);

    // Fix usage if needed
    if (result.usage?.raw) {
      const fixedRawUsage = this.fixUsageForGeminiModels(result.usage.raw);
      if (fixedRawUsage !== result.usage.raw) {
        // Recalculate usage with fixed data
        const promptTokens = fixedRawUsage.prompt_tokens ?? 0;
        const completionTokens = fixedRawUsage.completion_tokens ?? 0;
        const cacheReadTokens =
          fixedRawUsage.prompt_tokens_details?.cached_tokens ?? 0;
        const reasoningTokens =
          fixedRawUsage.completion_tokens_details?.reasoning_tokens ?? 0;

        return {
          ...result,
          usage: {
            inputTokens: {
              total: promptTokens,
              noCache: promptTokens - cacheReadTokens,
              cacheRead: cacheReadTokens,
              cacheWrite: undefined,
            },
            outputTokens: {
              total: completionTokens,
              text: completionTokens - reasoningTokens,
              reasoning: reasoningTokens,
            },
            raw: fixedRawUsage,
          },
        };
      }
    }

    return result;
  }

  async doStream(
    options: LanguageModelV3CallOptions,
  ): Promise<LanguageModelV3StreamResult> {
    const result = await super.doStream(options);

    // Wrap the stream to fix usage in the final chunk
    const originalStream = result.stream;
    const fixUsage = this.fixUsageForGeminiModels.bind(this);

    const transformedStream = new ReadableStream({
      async start(controller) {
        const reader = originalStream.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            // Fix usage in finish chunks
            if (value.type === 'finish' && value.usage?.raw) {
              const fixedRawUsage = fixUsage(value.usage.raw);
              if (fixedRawUsage !== value.usage.raw) {
                const promptTokens = fixedRawUsage.prompt_tokens ?? 0;
                const completionTokens = fixedRawUsage.completion_tokens ?? 0;
                const cacheReadTokens =
                  fixedRawUsage.prompt_tokens_details?.cached_tokens ?? 0;
                const reasoningTokens =
                  fixedRawUsage.completion_tokens_details?.reasoning_tokens ??
                  0;

                controller.enqueue({
                  ...value,
                  usage: {
                    inputTokens: {
                      total: promptTokens,
                      noCache: promptTokens - cacheReadTokens,
                      cacheRead: cacheReadTokens,
                      cacheWrite: undefined,
                    },
                    outputTokens: {
                      total: completionTokens,
                      text: completionTokens - reasoningTokens,
                      reasoning: reasoningTokens,
                    },
                    raw: fixedRawUsage,
                  },
                });
              } else {
                controller.enqueue(value);
              }
            } else {
              controller.enqueue(value);
            }
          }
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });

    return {
      ...result,
      stream: transformedStream,
    };
  }
}
