/**
Log probabilities for each token and its top log probabilities.
 */
export type LanguageModelV2LogProbs = Array<{
  token: string;
  logprob: number;
  topLogprobs: Array<{
    token: string;
    logprob: number;
  }>;
}>;
