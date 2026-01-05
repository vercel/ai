import { LanguageModelV3, ProviderV3 } from '@ai-sdk/provider';
import {
  FetchFunction,
  loadApiKey,
  loadOptionalSetting,
  withoutTrailingSlash,
  withUserAgentSuffix,
} from '@ai-sdk/provider-utils';
import { OpenAIChatLanguageModel } from '@ai-sdk/openai/internal';
import { VERSION } from './version';

export interface CloudflareAIGatewayProvider extends ProviderV3 {
  /**
   * Creates a model for text generation using Cloudflare AI Gateway.
   * Model format: {provider}/{model} (e.g., "openai/gpt-4", "anthropic/claude-3-5-sonnet-20241022")
   */
  (modelId: string): LanguageModelV3;

  /**
   * Creates a language model for text generation.
   * Model format: {provider}/{model} (e.g., "openai/gpt-4", "anthropic/claude-3-5-sonnet-20241022")
   */
  languageModel(modelId: string): LanguageModelV3;

  /**
   * Creates a chat model for text generation.
   * Model format: {provider}/{model} (e.g., "openai/gpt-4", "anthropic/claude-3-5-sonnet-20241022")
   */
  chat(modelId: string): LanguageModelV3;
}

export interface CloudflareAIGatewayProviderSettings {
  /**
   * Your Cloudflare Account ID.
   * You can find this in your Cloudflare dashboard.
   */
  accountId?: string;

  /**
   * Your Cloudflare AI Gateway ID.
   * This is the gateway name you created in the Cloudflare dashboard.
   */
  gatewayId?: string;

  /**
   * API key for the upstream AI provider (e.g., OpenAI API key).
   * This is passed in the Authorization header to the provider.
   *
   * If using BYOK (Bring Your Own Keys) or Unified Billing, you can omit this
   * and provide a Cloudflare API token via cfApiToken instead.
   */
  apiKey?: string;

  /**
   * Cloudflare API token for authenticated gateways.
   * This is sent via the cf-aig-authorization header.
   *
   * Required if using BYOK (Bring Your Own Keys) or Unified Billing.
   * Optional for unauthenticated gateways.
   */
  cfApiToken?: string;

  /**
   * Base URL for the Cloudflare AI Gateway API calls.
   * Defaults to https://gateway.ai.cloudflare.com/v1/{accountId}/{gatewayId}/compat
   */
  baseURL?: string;

  /**
   * Custom headers to include in the requests.
   */
  headers?: Record<string, string>;

  /**
   * Custom fetch implementation. You can use it as a middleware to intercept requests,
   * or to provide a custom fetch implementation for e.g. testing.
   */
  fetch?: FetchFunction;
}

/**
 * Create a Cloudflare AI Gateway provider instance.
 */
export function createCloudflareAIGateway(
  options: CloudflareAIGatewayProviderSettings = {},
): CloudflareAIGatewayProvider {
  // Load account ID from options or environment
  const accountId = loadOptionalSetting({
    settingValue: options.accountId,
    environmentVariableName: 'CLOUDFLARE_ACCOUNT_ID',
  });

  // Load gateway ID from options or environment
  const gatewayId = loadOptionalSetting({
    settingValue: options.gatewayId,
    environmentVariableName: 'CLOUDFLARE_GATEWAY_ID',
  });

  // Validate required settings
  if (!accountId) {
    throw new Error(
      'Cloudflare Account ID is required. ' +
        'Please provide it via the accountId option or CLOUDFLARE_ACCOUNT_ID environment variable.',
    );
  }

  if (!gatewayId) {
    throw new Error(
      'Cloudflare Gateway ID is required. ' +
        'Please provide it via the gatewayId option or CLOUDFLARE_GATEWAY_ID environment variable.',
    );
  }

  // Determine base URL
  const baseURL =
    withoutTrailingSlash(options.baseURL) ??
    `https://gateway.ai.cloudflare.com/v1/${accountId}/${gatewayId}/compat`;

  const getHeaders = () => {
    const headers: Record<string, string | undefined> = {
      ...options.headers,
    };

    // If we have a provider API key (for direct provider authentication)
    if (options.apiKey) {
      headers.Authorization = `Bearer ${options.apiKey}`;
    }

    // If we have a Cloudflare API token (for authenticated gateway or BYOK)
    const cfApiToken = loadOptionalSetting({
      settingValue: options.cfApiToken,
      environmentVariableName: 'CLOUDFLARE_API_TOKEN',
    });

    if (cfApiToken) {
      headers['cf-aig-authorization'] = `Bearer ${cfApiToken}`;
    }

    // If neither is provided, try loading a generic API key
    // (this could be either provider key or CF token depending on setup)
    if (!options.apiKey && !cfApiToken) {
      try {
        const apiKey = loadApiKey({
          apiKey: undefined,
          environmentVariableName: 'CLOUDFLARE_AI_GATEWAY_API_KEY',
          description: 'Cloudflare AI Gateway',
        });
        headers.Authorization = `Bearer ${apiKey}`;
      } catch {
        // No API key available - this is fine for some configurations
      }
    }

    return withUserAgentSuffix(
      headers,
      `ai-sdk/cloudflare-ai-gateway/${VERSION}`,
    );
  };

  const createChatModel = (modelId: string) =>
    new OpenAIChatLanguageModel(modelId, {
      provider: 'cloudflare-ai-gateway',
      url: ({ path }) => `${baseURL}${path}`,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const createLanguageModel = (modelId: string) => {
    if (new.target) {
      throw new Error(
        'The Cloudflare AI Gateway model function cannot be called with the new keyword.',
      );
    }

    return createChatModel(modelId);
  };

  const provider = function (modelId: string) {
    return createLanguageModel(modelId);
  };

  provider.specificationVersion = 'v3' as const;
  provider.languageModel = createLanguageModel;
  provider.chat = createChatModel;

  // These are not supported through the OpenAI-compatible endpoint
  // Users should use provider-specific endpoints for these features
  provider.embeddingModel = () => {
    throw new Error(
      "Embedding models are not supported through Cloudflare AI Gateway's OpenAI-compatible endpoint. " +
        'Use provider-specific endpoints instead.',
    );
  };

  provider.imageModel = () => {
    throw new Error(
      "Image models are not supported through Cloudflare AI Gateway's OpenAI-compatible endpoint. " +
        'Use provider-specific endpoints instead.',
    );
  };

  return provider as CloudflareAIGatewayProvider;
}

/**
 * Default Cloudflare AI Gateway provider instance.
 * Requires CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_GATEWAY_ID environment variables.
 */
let cloudflareAIGatewayInstance: CloudflareAIGatewayProvider | undefined;

export const cloudflareAIGateway = (() => {
  if (!cloudflareAIGatewayInstance) {
    try {
      cloudflareAIGatewayInstance = createCloudflareAIGateway();
    } catch (error) {
      // Allow delayed initialization when environment variables aren't set
      // Users can call createCloudflareAIGateway() explicitly instead
      cloudflareAIGatewayInstance = undefined as any;
    }
  }
  return cloudflareAIGatewayInstance;
})();
