import {
  NoSuchModelError,
  type Experimental_VideoModelV4,
  type ProviderV4,
} from '@ai-sdk/provider';
import {
  loadApiKey,
  withoutTrailingSlash,
  withUserAgentSuffix,
  type FetchFunction,
} from '@ai-sdk/provider-utils';
import { SiftQVideoModel } from './siftq-video-model';
import { VERSION } from './version';

export interface SiftQProviderSettings {
  /**
   * SiftQ API key. Defaults to the `SIFTQ_API_KEY` environment variable.
   */
  apiKey?: string;

  /**
   * Base URL for SiftQ MiniMax-compatible API calls.
   * Defaults to `https://siftq.com/api/minimax/`.
   */
  baseURL?: string;

  /**
   * Custom headers to include in requests.
   */
  headers?: Record<string, string>;

  /**
   * Custom fetch implementation for testing or request interception.
   */
  fetch?: FetchFunction;
}

export interface SiftQProvider extends ProviderV4 {
  /** Creates the fixed MiniMax-H3 video generation model. */
  video(): Experimental_VideoModelV4;

  /** Creates the fixed MiniMax-H3 video generation model. */
  videoModel(): Experimental_VideoModelV4;
}

const defaultBaseURL = 'https://siftq.com/api/minimax/';

function resolveBaseURL(baseURL: string | undefined): string {
  const normalized = withoutTrailingSlash(baseURL ?? defaultBaseURL);
  const value = normalized ?? defaultBaseURL;

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new TypeError(`Invalid SiftQ baseURL: ${value}`);
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new TypeError(
      `Invalid SiftQ baseURL protocol: ${parsed.protocol}. Expected http: or https:.`,
    );
  }

  return value;
}

/**
 * Creates a SiftQ provider instance.
 */
export function createSiftQ(
  options: SiftQProviderSettings = {},
): SiftQProvider {
  const baseURL = resolveBaseURL(options.baseURL);

  const getHeaders = () =>
    withUserAgentSuffix(
      {
        Authorization: `Bearer ${loadApiKey({
          apiKey: options.apiKey,
          environmentVariableName: 'SIFTQ_API_KEY',
          description: 'SiftQ API key',
        })}`,
        ...options.headers,
      },
      `ai-sdk/siftq/${VERSION}`,
    );

  const createVideoModel = () => {
    return new SiftQVideoModel({
      provider: 'siftq.video',
      baseURL,
      headers: getHeaders,
      fetch: options.fetch,
    });
  };

  return {
    specificationVersion: 'v4' as const,
    languageModel: (modelId: string) => {
      throw new NoSuchModelError({ modelId, modelType: 'languageModel' });
    },
    embeddingModel: (modelId: string) => {
      throw new NoSuchModelError({ modelId, modelType: 'embeddingModel' });
    },
    imageModel: (modelId: string) => {
      throw new NoSuchModelError({ modelId, modelType: 'imageModel' });
    },
    video: createVideoModel,
    videoModel: createVideoModel,
  };
}

/**
 * Default SiftQ provider instance.
 */
export const siftq = createSiftQ();
