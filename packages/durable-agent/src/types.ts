/**
 * Shared types for AI SDK v5 and v6 compatibility.
 */
import type {
  LanguageModelV2,
  LanguageModelV2CallOptions,
  LanguageModelV2StreamPart,
} from '@ai-sdk/provider';

/**
 * Compatible language model type that works with both AI SDK v5 and v6.
 *
 * AI SDK v5 uses LanguageModelV2, while AI SDK v6 uses LanguageModelV3.
 * Both have compatible `doStream` interfaces for our use case.
 *
 * This type represents the union of both model versions, allowing code
 * to work seamlessly with either AI SDK version.
 *
 * Note: V3 models accept LanguageModelV2CallOptions at runtime due to
 * structural compatibility between V2 and V3 prompt/options formats.
 */
export type CompatibleLanguageModel =
  | LanguageModelV2
  | {
      readonly specificationVersion: 'v3';
      readonly provider: string;
      readonly modelId: string;
      /**
       * Stream method compatible with both V2 and V3 models.
       * V3 models accept V2-style call options due to structural compatibility
       * at runtime - the prompt and options structures are essentially identical.
       */
      doStream(options: LanguageModelV2CallOptions): PromiseLike<{
        stream: ReadableStream<LanguageModelV2StreamPart>;
      }>;
    };
