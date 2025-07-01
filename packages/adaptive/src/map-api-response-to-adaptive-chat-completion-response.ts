import { AdaptiveChatCompletionResponse } from './adaptive-types';

export function mapApiResponseToAdaptiveChatCompletionResponse(
  apiResponse: any,
): AdaptiveChatCompletionResponse {
  return {
    id: apiResponse.ID,
    object: apiResponse.Object,
    created: apiResponse.Created,
    model: apiResponse.Model,
    choices: (apiResponse.Choices || []).map((choice: any) => ({
      index: choice.Index,
      message: choice.Message,
      finish_reason: choice.FinishReason ?? null,
    })),
    usage: apiResponse.Usage
      ? {
          prompt_tokens: apiResponse.Usage.PromptTokens,
          completion_tokens: apiResponse.Usage.CompletionTokens,
          total_tokens: apiResponse.Usage.TotalTokens,
          cost_saved: apiResponse.Usage.CostSaved,
        }
      : undefined,
  };
}
