import {
  LanguageModelV2,
  LanguageModelV2Usage,
  LanguageModelV3,
  LanguageModelV3Usage,
} from '@ai-sdk/provider';
import { logV2CompatibilityWarning } from '../util/log-v2-compatibility-warning';

function convertV2UsageToV3(usage: LanguageModelV2Usage): LanguageModelV3Usage {
  const inputTokens = usage.inputTokens ?? 0;
  const outputTokens = usage.outputTokens ?? 0;
  const cachedInputTokens = usage.cachedInputTokens ?? 0;
  const reasoningTokens = usage.reasoningTokens ?? 0;

  return {
    inputTokens: {
      total: usage.inputTokens,
      noCache: inputTokens - cachedInputTokens,
      cacheRead: usage.cachedInputTokens,
      cacheWrite: undefined,
    },
    outputTokens: {
      total: usage.outputTokens,
      text: outputTokens - reasoningTokens,
      reasoning: usage.reasoningTokens,
    },
    raw: usage,
  };
}

export function asLanguageModelV3(
  model: LanguageModelV2 | LanguageModelV3,
): LanguageModelV3 {
  if (model.specificationVersion === 'v3') {
    return model;
  }

  logV2CompatibilityWarning({
    provider: model.provider,
    modelId: model.modelId,
  });

  // TODO this could break, we need to properly map v2 to v3
  // and support all relevant v3 properties:
  return new Proxy(model, {
    get(target, prop: keyof LanguageModelV2) {
      if (prop === 'specificationVersion') return 'v3';

      if (prop === 'doGenerate') {
        return async (...args: Parameters<LanguageModelV2['doGenerate']>) => {
          const result = await target.doGenerate(...args);
          return {
            ...result,
            usage: convertV2UsageToV3(result.usage),
          };
        };
      }

      return target[prop];
    },
  }) as unknown as LanguageModelV3;
}
