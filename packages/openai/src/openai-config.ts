import type { FetchFunction } from '@ai-sdk/provider-utils';

type OpenAIHeaders = Record<string, string | undefined>;

type SerializedOpenAIConfig = Omit<Partial<OpenAIConfig>, 'headers'> & {
  headers?: (() => OpenAIHeaders) | OpenAIHeaders;
};

export type OpenAIConfig = {
  provider: string;
  baseURL?: string;
  url: (options: { modelId: string; path: string }) => string;
  headers?: () => OpenAIHeaders;
  fetch?: FetchFunction;
  generateId?: () => string;
  /**
   * This is soft-deprecated. Use provider references (e.g. `{ openai: 'file-abc123' }`)
   * in file part data instead. File ID prefixes used to identify file IDs
   * in Responses API. When undefined, all string file data is treated as
   * base64 content.
   *
   * TODO: remove in v8
   */
  fileIdPrefixes?: readonly string[];
};

export function prepareOpenAIConfigForWorkflowDeserialize(
  config: SerializedOpenAIConfig,
): OpenAIConfig {
  if (config.provider == null) {
    throw new Error(
      'OpenAI model is missing provider after workflow deserialization.',
    );
  }

  return {
    ...config,
    provider: config.provider,
    url:
      typeof config.url === 'function'
        ? config.url
        : ({ path }) => {
            if (config.baseURL == null) {
              throw new Error(
                'OpenAI model is missing baseURL after workflow deserialization.',
              );
            }

            return `${config.baseURL}${path}`;
          },
    headers:
      typeof config.headers === 'function'
        ? config.headers
        : config.headers == null
          ? undefined
          : () => config.headers as OpenAIHeaders,
  };
}
