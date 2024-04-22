export type LanguageModelV1LogProbs = Array<{
  token: string;
  logprob: number;
  top_logprobs: Array<{
    token: string;
    logprob: number;
  }>;
}>;
