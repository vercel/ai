import {
  NoSuchModelError,
  type ProviderV3,
  type Experimental_VideoModelV3 as VideoModelV3,
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

export interface HeyGenProvider extends ProviderV3 {
  video(modelId: HeyGenVideoModelId): VideoModelV3;
  videoModel(modelId: HeyGenVideoModelId): VideoModelV3;
}

export function createHeyGen(
  options: HeyGenProviderSettings = {},
): HeyGenProvider {
  const baseURL =
    withoutTrailingSlash(options.baseURL ?? 'https://api.heygen.com') ??
    'https://api.heygen.com';
  const createVideoModel = (modelId: HeyGenVideoModelId): VideoModelV3 =>
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
    specificationVersion: 'v3',
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
