import {
  type APICallError,
  NoSuchModelError,
  type LanguageModelV4,
  type ProviderV4,
} from '@ai-sdk/provider';
import {
  generateId,
  withUserAgentSuffix,
  type FetchFunction,
  type ResponseHandler,
} from '@ai-sdk/provider-utils';
import {
  createOpenResponsesExtensionRegistry,
  type OpenResponsesExtensionRegistration,
} from './open-responses-extension';
import { createOpenResponsesTools } from './open-responses-tools';
import { OpenResponsesLanguageModel } from './responses/open-responses-language-model';
import { VERSION } from './version';
import type { OpenResponsesConfig } from './responses/open-responses-config';

export interface OpenResponsesProvider extends ProviderV4 {
  (modelId: string): LanguageModelV4;

  tools: ReturnType<typeof createOpenResponsesTools>;
}

export interface OpenResponsesProviderSettings {
  /**
   * URL for the Open Responses API POST endpoint.
   */
  url: string;

  /**
   * Provider name. Used as key for provider options and metadata.
   */
  name: string;

  /**
   * API key for authenticating requests.
   */
  apiKey?: string;

  /**
   * Custom headers to include in the requests.
   */
  headers?: Record<string, string> | (() => Record<string, string>);

  /**
   * Custom fetch implementation. You can use it as a middleware to intercept requests,
   * or to provide a custom fetch implementation for e.g. testing.
   */
  fetch?: FetchFunction;

  /**
   * Custom handler for non-successful HTTP responses.
   */
  failedResponseHandler?: ResponseHandler<APICallError>;

  /**
   * Extracts HTTP status and retryability metadata from endpoint-specific
   * response errors. Applies to both generation and streaming errors.
   */
  getResponseErrorMetadata?: OpenResponsesConfig['getResponseErrorMetadata'];

  /**
   * Whether to serialize assistant history using the strict OpenAI Responses
   * input schemas. Assistant messages without an item ID are sent as easy input
   * messages, while messages with an item ID are sent as complete output items.
   *
   * @default false
   */
  strictResponseInput?: boolean;

  /**
   * Provider-tool ID used for caller-executed Open Responses custom tools.
   *
   * @default 'open-responses.custom'
   */
  customToolId?: `${string}.${string}`;

  /**
   * Whether JSON response formats are sent to the endpoint. When disabled,
   * structured output requests produce an unsupported warning and are omitted.
   *
   * @default true
   */
  structuredOutputs?: boolean;

  /**
   * User-agent suffix for requests.
   *
   * @default `ai-sdk/open-responses/<version>`
   */
  userAgentSuffix?: string;

  /**
   * Codecs for Open Responses extension tools, items, and streaming events.
   *
   * @experimental This API may change in a future release.
   */
  experimental_extensions?: readonly OpenResponsesExtensionRegistration[];
}

export function createOpenResponses(
  options: OpenResponsesProviderSettings,
): OpenResponsesProvider {
  const providerName = options.name;
  const customToolId = options.customToolId ?? 'open-responses.custom';
  const extensionRegistry = createOpenResponsesExtensionRegistry(
    options.experimental_extensions,
  );

  const getHeaders = () =>
    withUserAgentSuffix(
      {
        ...(options.apiKey
          ? {
              Authorization: `Bearer ${options.apiKey}`,
            }
          : {}),
        ...(typeof options.headers === 'function'
          ? options.headers()
          : options.headers),
      },
      options.userAgentSuffix ?? `ai-sdk/open-responses/${VERSION}`,
    );

  const createResponsesModel = (modelId: string) => {
    return new OpenResponsesLanguageModel(modelId, {
      provider: `${providerName}.responses`,
      providerOptionsName: providerName,
      headers: getHeaders,
      url: options.url,
      fetch: options.fetch,
      failedResponseHandler: options.failedResponseHandler,
      getResponseErrorMetadata: options.getResponseErrorMetadata,
      generateId: () => generateId(),
      extensionRegistry,
      strictResponseInput: options.strictResponseInput,
      customToolId,
      structuredOutputs: options.structuredOutputs,
    });
  };

  const createLanguageModel = (modelId: string) => {
    if (new.target) {
      throw new Error(
        'The OpenAI model function cannot be called with the new keyword.',
      );
    }

    return createResponsesModel(modelId);
  };

  const provider = function (modelId: string) {
    return createLanguageModel(modelId);
  };

  provider.specificationVersion = 'v4' as const;
  provider.languageModel = createLanguageModel;
  provider.tools = createOpenResponsesTools({ customToolId });

  provider.embeddingModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'embeddingModel' });
  };
  provider.imageModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'imageModel' });
  };

  return provider as OpenResponsesProvider;
}
