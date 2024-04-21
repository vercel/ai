import { LanguageModelV1LogProbs } from "@ai-sdk/provider";

type OpenAIChatLogProbs = {
  content: {
    token: string;
    logprob: number;
    top_logprobs: {
      token: string;
      logprob: number;
    }[] | null;
  }[] | null;
}

export function mapOpenAIChatLogProbs(logprobs: OpenAIChatLogProbs): LanguageModelV1LogProbs {
  return logprobs.content?.map(({ token, logprob, top_logprobs }) => ({
    token,
    logprob,
    top_logprobs: top_logprobs ? top_logprobs.map(({ token, logprob }) => ({
      token,
      logprob,
    })) : [],
  })) ?? []
}