import { z, ZodSchema } from 'zod';

export const openaiCompatibleUsageSchema = z.object({
  prompt_tokens: z.number().nullish(),
  completion_tokens: z.number().nullish(),
});

export type OpenAICompatibleUsageData = z.infer<
  typeof openaiCompatibleUsageSchema
>;

// TODO: Below redefines needed base types else we'd need to
// import { LanguageModelUsage } from 'ai';
export interface BaseLanguageModelUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ExtendedLanguageModelUsage extends BaseLanguageModelUsage {
  [key: string]: number;
}

export type BaseUsageMetrics = ExtendedLanguageModelUsage;

export type ProviderUsageStructure<
  PROVIDER_USAGE_DATA,
  TRANSFORMED_USAGE_DATA extends BaseUsageMetrics = BaseUsageMetrics,
> = {
  usageSchema: ZodSchema<PROVIDER_USAGE_DATA>;
  transformUsage: (
    usage: PROVIDER_USAGE_DATA | null | undefined,
  ) => TRANSFORMED_USAGE_DATA;
};

export const defaultOpenAICompatibleUsageStructure: ProviderUsageStructure<OpenAICompatibleUsageData> =
  {
    usageSchema: openaiCompatibleUsageSchema,
    transformUsage: usage => {
      const promptTokens = usage?.prompt_tokens ?? 0;
      const completionTokens = usage?.completion_tokens ?? 0;
      return {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      };
    },
  };
