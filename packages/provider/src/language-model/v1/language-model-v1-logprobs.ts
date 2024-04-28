/**
Log probabilities for each token and its top log probabilities.
 */
export type LanguageModelV1LogProbs = Array<{
  token: string;
  logprob: number;
  topLogprobs: Array<{
    token: string;
    logprob: number;
  }>;
}>;
