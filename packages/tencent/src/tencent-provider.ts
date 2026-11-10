import {
  LoadSettingError,
  NoSuchModelError,
  type Experimental_VideoModelV4 as VideoModelV4,
  type LanguageModelV4,
  type ProviderV4,
} from '@ai-sdk/provider';
import {
  type FetchFunction,
  loadApiKey,
  loadOptionalSetting,
  loadSetting,
  type Resolvable,
  resolveWith,
  withoutTrailingSlash,
  withUserAgentSuffix,
} from '@ai-sdk/provider-utils';
import { TencentChatLanguageModel } from './tencent-chat-language-model';
import type { TencentChatModelId } from './tencent-chat-options';
import {
  TencentVideoModel,
  type TencentVodCredentials,
} from './tencent-video-model';
import type { TencentVideoModelId } from './tencent-video-settings';
import { VERSION } from './version';

export interface TencentProviderSettings {
  /**
   * TokenHub API key (`sk-...`), used by language models and TokenHub video
   * models. Defaults to the `TENCENT_TOKENHUB_API_KEY` environment variable.
   */
  apiKey?: Resolvable<string>;

  /**
   * TokenHub base URL. Defaults to
   * `https://tokenhub-intl.tencentcloudmaas.com/v1`.
   */
  baseURL?: string;

  /**
   * Tencent Cloud API SecretId, used by VOD video models. Defaults to the
   * `TENCENTCLOUD_SECRET_ID` environment variable.
   */
  secretId?: string;

  /**
   * Tencent Cloud API SecretKey, used by VOD video models. Defaults to the
   * `TENCENTCLOUD_SECRET_KEY` environment variable.
   */
  secretKey?: string;

  /**
   * Session token for temporary Tencent Cloud credentials (sent as
   * `X-TC-Token`). Not needed with a long-term SecretId/SecretKey pair.
   */
  sessionToken?: string;

  /**
   * VOD application ID (`SubAppId`), used by VOD video models. Defaults to the
   * `TENCENTCLOUD_VOD_SUB_APP_ID` environment variable.
   */
  subAppId?: number | string;

  /**
   * Tencent Cloud region sent as `X-TC-Region` on VOD requests. VOD AIGC
   * actions do not require a region.
   */
  region?: string;

  /**
   * VOD API base URL. Defaults to `https://vod.intl.tencentcloudapi.com`.
   */
  vodBaseURL?: string;

  /**
   * Custom headers to include in the requests.
   */
  headers?: Record<string, string>;

  /**
   * Custom fetch implementation. You can use it as a middleware to intercept
   * requests, or to provide a custom fetch implementation for e.g. testing.
   */
  fetch?: FetchFunction;
}

export interface TencentProvider extends ProviderV4 {
  /**
   * Creates a TokenHub model for text generation.
   */
  (modelId: TencentChatModelId): LanguageModelV4;

  /**
   * Creates a TokenHub model for text generation.
   */
  languageModel(modelId: TencentChatModelId): LanguageModelV4;

  /**
   * Creates a TokenHub chat model for text generation.
   */
  chat(modelId: TencentChatModelId): LanguageModelV4;

  /**
   * Creates a model for video generation. TokenHub Kling models use their
   * TokenHub ID (e.g. `kling-video-v3`); VOD AIGC models use
   * `vod/<ModelName>/<ModelVersion>` (e.g. `vod/VS/2.0`).
   */
  video(modelId: TencentVideoModelId): VideoModelV4;

  /**
   * Creates a model for video generation.
   */
  videoModel(modelId: TencentVideoModelId): VideoModelV4;

  /**
   * @deprecated Use `embeddingModel` instead.
   */
  textEmbeddingModel(modelId: string): never;
}

const defaultTokenHubBaseURL = 'https://tokenhub-intl.tencentcloudmaas.com/v1';
const defaultVodBaseURL = 'https://vod.intl.tencentcloudapi.com';

function parseSubAppId(value: number | string): number {
  const subAppId = typeof value === 'number' ? value : Number(value.trim());
  if (!Number.isSafeInteger(subAppId) || subAppId <= 0) {
    throw new LoadSettingError({
      message: 'Tencent VOD SubAppId must be a positive integer.',
    });
  }
  return subAppId;
}

export function createTencent(
  options: TencentProviderSettings = {},
): TencentProvider {
  const baseURL =
    withoutTrailingSlash(options.baseURL ?? defaultTokenHubBaseURL) ??
    defaultTokenHubBaseURL;
  const vodBaseURL =
    withoutTrailingSlash(options.vodBaseURL ?? defaultVodBaseURL) ??
    defaultVodBaseURL;
  const userAgentSuffix = `ai-sdk-tencent/${VERSION}`;

  const getTokenHubHeaders = () =>
    resolveWith(options.apiKey, apiKey =>
      withUserAgentSuffix(
        {
          Authorization: `Bearer ${loadApiKey({
            apiKey,
            environmentVariableName: 'TENCENT_TOKENHUB_API_KEY',
            description: 'Tencent TokenHub API key',
          })}`,
          ...options.headers,
        },
        userAgentSuffix,
      ),
    );

  const getVodHeaders = () =>
    withUserAgentSuffix({ ...options.headers }, userAgentSuffix);

  const getVodCredentials = (): TencentVodCredentials => {
    const subAppId =
      options.subAppId ??
      loadSetting({
        settingValue: undefined,
        settingName: 'subAppId',
        environmentVariableName: 'TENCENTCLOUD_VOD_SUB_APP_ID',
        description: 'Tencent VOD SubAppId',
      });

    return {
      secretId: loadSetting({
        settingValue: options.secretId,
        settingName: 'secretId',
        environmentVariableName: 'TENCENTCLOUD_SECRET_ID',
        description: 'Tencent Cloud SecretId',
      }),
      secretKey: loadSetting({
        settingValue: options.secretKey,
        settingName: 'secretKey',
        environmentVariableName: 'TENCENTCLOUD_SECRET_KEY',
        description: 'Tencent Cloud SecretKey',
      }),
      sessionToken: loadOptionalSetting({
        settingValue: options.sessionToken,
        environmentVariableName: 'TENCENTCLOUD_SESSION_TOKEN',
      }),
      subAppId: parseSubAppId(subAppId),
    };
  };

  const createLanguageModel = (modelId: TencentChatModelId) =>
    new TencentChatLanguageModel(modelId, {
      provider: 'tencent.chat',
      baseURL,
      headers: getTokenHubHeaders,
      fetch: options.fetch,
    });

  const createVideoModel = (modelId: TencentVideoModelId) =>
    new TencentVideoModel(modelId, {
      provider: 'tencent.video',
      tokenHub: { baseURL, headers: getTokenHubHeaders },
      vod: {
        baseURL: vodBaseURL,
        region: options.region,
        credentials: getVodCredentials,
        headers: getVodHeaders,
      },
      fetch: options.fetch,
    });

  const provider = (modelId: TencentChatModelId) =>
    createLanguageModel(modelId);

  provider.specificationVersion = 'v4' as const;
  provider.languageModel = createLanguageModel;
  provider.chat = createLanguageModel;
  provider.video = createVideoModel;
  provider.videoModel = createVideoModel;

  provider.embeddingModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'embeddingModel' });
  };
  provider.textEmbeddingModel = provider.embeddingModel;
  provider.imageModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'imageModel' });
  };

  return provider;
}

/**
 * Default Tencent provider instance.
 */
export const tencent = createTencent();
