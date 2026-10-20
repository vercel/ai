import {
  InvalidArgumentError,
  UnsupportedFunctionalityError,
  type Experimental_RealtimeFactoryV4 as RealtimeFactoryV4,
  type Experimental_RealtimeModelV4 as RealtimeModelV4,
} from '@ai-sdk/provider';
import { OpenAIRealtimeModelLive } from '../live/openai-realtime-model-live';
import {
  OpenAIRealtimeModel,
  type OpenAIRealtimeModelConfig,
} from './openai-realtime-model';

const knownLiveModelIds = ['gpt-live-1'] as const;

export type OpenAIRealtimeOptions = {
  /** Overrides model ID routing, including for early-access models. */
  api?: 'live' | 'realtime';
};

export interface OpenAIRealtimeFactory extends RealtimeFactoryV4 {
  (modelId: string, options: { api: 'live' }): OpenAIRealtimeModelLive;
  (modelId: string, options: { api: 'realtime' }): OpenAIRealtimeModel;
  (
    modelId: (typeof knownLiveModelIds)[number],
    options?: { api?: undefined },
  ): OpenAIRealtimeModelLive;
  (modelId: string, options?: OpenAIRealtimeOptions): RealtimeModelV4;

  getToken(
    options: Parameters<RealtimeFactoryV4['getToken']>[0] &
      OpenAIRealtimeOptions,
  ): ReturnType<RealtimeFactoryV4['getToken']>;
}

function resolveRealtimeApi(
  modelId: string,
  { api }: OpenAIRealtimeOptions = {},
): 'live' | 'realtime' {
  if (api !== undefined) {
    if (api !== 'live' && api !== 'realtime') {
      throw new InvalidArgumentError({
        argument: 'api',
        message: 'OpenAI realtime api must be "live" or "realtime".',
      });
    }
    return api;
  }

  return knownLiveModelIds.some(knownModelId => knownModelId === modelId)
    ? 'live'
    : 'realtime';
}

export function createOpenAIRealtimeFactory(
  config: OpenAIRealtimeModelConfig,
): OpenAIRealtimeFactory {
  const createModel = (modelId: string, options?: OpenAIRealtimeOptions) => {
    const api = resolveRealtimeApi(modelId, options);
    const modelConfig = { ...config, provider: `${config.provider}.${api}` };
    return api === 'live'
      ? new OpenAIRealtimeModelLive(modelId, modelConfig)
      : new OpenAIRealtimeModel(modelId, modelConfig);
  };

  return Object.assign(createModel, {
    getToken: async (
      options: Parameters<OpenAIRealtimeFactory['getToken']>[0],
    ) => {
      const model = createModel(options.model, options);
      if (model instanceof OpenAIRealtimeModelLive) {
        throw new UnsupportedFunctionalityError({
          functionality:
            'Short-lived OpenAI credentials for the Live API. Use server WebSocket setup via getServerWebSocketConfig() with a server-side API key instead.',
        });
      }

      const secret = await model.doCreateClientSecret({
        sessionConfig: options.sessionConfig,
        expiresAfterSeconds: options.expiresAfterSeconds,
      });
      return {
        token: secret.token,
        url: secret.url,
        expiresAt: secret.expiresAt,
      };
    },
  }) as OpenAIRealtimeFactory;
}
