import { LanguageModelV3CallOptions } from './language-model-v3-call-options';
import { LanguageModelV3CountTokensOptions } from './language-model-v3-count-tokens-options';
import { LanguageModelV3CountTokensResult } from './language-model-v3-count-tokens-result';
import { LanguageModelV3GenerateResult } from './language-model-v3-generate-result';
import { LanguageModelV3StreamResult } from './language-model-v3-stream-result';

/**
 * Specification for a language model that implements the language model interface version 3.
 */
export type LanguageModelV3 = {
  /**
   * The language model must specify which language model interface version it implements.
   */
  readonly specificationVersion: 'v3';

  /**
   * Provider ID.
   */
  readonly provider: string;

  /**
   * Provider-specific model ID.
   */
  readonly modelId: string;

  /**
   * Supported URL patterns by media type for the provider.
   *
   * The keys are media type patterns or full media types (e.g. `*\/*` for everything, `audio/*`, `video/*`, or `application/pdf`).
   * and the values are arrays of regular expressions that match the URL paths.
   *
   * The matching should be against lower-case URLs.
   *
   * Matched URLs are supported natively by the model and are not downloaded.
   *
   * @returns A map of supported URL patterns by media type (as a promise or a plain object).
   */
  supportedUrls:
    | PromiseLike<Record<string, RegExp[]>>
    | Record<string, RegExp[]>;

  /**
   * Generates a language model output (non-streaming).

   * Naming: "do" prefix to prevent accidental direct usage of the method
   * by the user.
   */
  doGenerate(
    options: LanguageModelV3CallOptions,
  ): PromiseLike<LanguageModelV3GenerateResult>;

  /**
   * Generates a language model output (streaming).
   *
   * Naming: "do" prefix to prevent accidental direct usage of the method
   * by the user.
   *
   * @return A stream of higher-level language model output parts.
   */
  doStream(
    options: LanguageModelV3CallOptions,
  ): PromiseLike<LanguageModelV3StreamResult>;

  /**
   * Counts the number of tokens in a prompt (optional).
   *
   * Not all providers support token counting. Providers that support
   * native token counting APIs (e.g., Anthropic, Google) implement this
   * method. For providers without native support (e.g., OpenAI), local
   * estimation may be used.
   *
   * Naming: "do" prefix to prevent accidental direct usage of the method
   * by the user.
   */
  doCountTokens?(
    options: LanguageModelV3CountTokensOptions,
  ): PromiseLike<LanguageModelV3CountTokensResult>;
};
