export type LanguageModelV1LogProbs = {
  token: string;
  logprob: number;
  top_logprobs: {
    token: string;
    logprob: number;
  }[];
}[];