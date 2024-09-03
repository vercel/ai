import { LanguageModelV1, LanguageModelV1CallOptions } from '@ai-sdk/provider';

export type LanguageModelV1Middleware = {
  transformParams?: (options: {
    params: LanguageModelV1CallOptions;
  }) => PromiseLike<LanguageModelV1CallOptions>;

  wrapGenerate?: (options: {
    doGenerate: () => ReturnType<LanguageModelV1['doGenerate']>;
  }) => ReturnType<LanguageModelV1['doGenerate']>;

  wrapStream?: (options: {
    doStream: () => ReturnType<LanguageModelV1['doStream']>;
  }) => ReturnType<LanguageModelV1['doStream']>;
};
