import { SharedV3ProviderOptions } from '../../shared/v3/shared-v3-provider-options';
import { LanguageModelV3FunctionTool } from './language-model-v3-function-tool';
import { LanguageModelV3Prompt } from './language-model-v3-prompt';
import { LanguageModelV3ProviderTool } from './language-model-v3-provider-tool';

/**
 * Options for counting tokens in a prompt.
 */
export type LanguageModelV3CountTokensOptions = {
  /**
   * The prompt to count tokens for.
   */
  prompt: LanguageModelV3Prompt;

  /**
   * Optional tools to include in the token count.
   * Tool definitions contribute to the total token count.
   */
  tools?: Array<LanguageModelV3FunctionTool | LanguageModelV3ProviderTool>;

  /**
   * An optional abort signal that can be used to cancel the call.
   */
  abortSignal?: AbortSignal;

  /**
   * Additional HTTP headers to be sent with the request.
   * Only applicable for HTTP-based providers.
   */
  headers?: Record<string, string | undefined>;

  /**
   * Provider-specific options that are passed through to the provider.
   */
  providerOptions?: SharedV3ProviderOptions;
};
