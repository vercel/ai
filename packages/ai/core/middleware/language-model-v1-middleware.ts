import { LanguageModelV1, LanguageModelV1CallOptions } from '@ai-sdk/provider';

export type Experimental_LanguageModelV1Middleware = {
  transformParams?: (options: {
    type: 'generate' | 'stream';
    params: LanguageModelV1CallOptions;
  }) => PromiseLike<LanguageModelV1CallOptions>;

  wrapGenerate?: (options: {
    doGenerate: () => ReturnType<LanguageModelV1['doGenerate']>;
    params: LanguageModelV1CallOptions;
    model: LanguageModelV1;
  }) => Promise<Awaited<ReturnType<LanguageModelV1['doGenerate']>>>;

  wrapStream?: (options: {
    doStream: () => ReturnType<LanguageModelV1['doStream']>;
    params: LanguageModelV1CallOptions;
    model: LanguageModelV1;
  }) => PromiseLike<Awaited<ReturnType<LanguageModelV1['doStream']>>>;
};
