import {
  NoSuchModelError,
  type ProviderV4,
  type Experimental_VideoModelV4 as VideoModelV4,
} from '@ai-sdk/provider';
import {
  loadApiKey,
  withoutTrailingSlash,
  withUserAgentSuffix,
  type FetchFunction,
} from '@ai-sdk/provider-utils';
import { HeyGenVideoModel } from './heygen-video-model';
import type { HeyGenVideoModelId } from './heygen-video-settings';
import { VERSION } from './version';

export interface HeyGenProviderSettings {
  /** API key. Defaults to the HEYGEN_API_KEY environment variable. */
  apiKey?: string;
  /** API URL prefix. Defaults to https://api.heygen.com. */
  baseURL?: string;
  /** Additional headers to include in requests. */
  headers?: Record<string, string>;
  /** Custom fetch implementation. */
  fetch?: FetchFunction;
}

export interface HeyGenProvider extends ProviderV4 {
  video(modelId: HeyGenVideoModelId): VideoModelV4;
  videoModel(modelId: HeyGenVideoModelId): VideoModelV4;
}

export function createHeyGen(
  options: HeyGenProviderSettings = {},
): HeyGenProvider {
  const baseURL =
    withoutTrailingSlash(options.baseURL ?? 'https://api.heygen.com') ??
    'https://api.heygen.com';
  const createVideoModel = (modelId: HeyGenVideoModelId): VideoModelV4 =>
    new HeyGenVideoModel(modelId, {
      provider: 'heygen.video',
      baseURL,
      headers: () =>
        withUserAgentSuffix(
          {
            'x-api-key': loadApiKey({
              apiKey: options.apiKey,
              environmentVariableName: 'HEYGEN_API_KEY',
              description: 'HeyGen',
            }),
            ...options.headers,
          },
          `ai-sdk-heygen/${VERSION}`,
        ),
      fetch: options.fetch,
    });

  return {
    specificationVersion: 'v4',
    video: createVideoModel,
    videoModel: createVideoModel,
    languageModel(modelId) {
      throw new NoSuchModelError({ modelId, modelType: 'languageModel' });
    },
    imageModel(modelId) {
      throw new NoSuchModelError({ modelId, modelType: 'imageModel' });
    },
    embeddingModel(modelId) {
      throw new NoSuchModelError({ modelId, modelType: 'embeddingModel' });
    },
  };
}

export const heygen = createHeyGen();
