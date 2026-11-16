import { resolve } from '@ai-sdk/provider-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GatewayBatch } from './gateway-batch';
import {
  createDefaultGatewayBatch,
  createDefaultGatewayDecisionModel,
  createDefaultGatewayEmbeddingModel,
  createDefaultGatewayImageModel,
  createDefaultGatewayLanguageModel,
  createDefaultGatewayRerankingModel,
  createDefaultGatewaySpeechModel,
  createDefaultGatewayTranscriptionModel,
  createDefaultGatewayVideoModel,
} from './gateway-default-models';
import { GatewayDecisionModel } from './gateway-decision-model';
import { GatewayEmbeddingModel } from './gateway-embedding-model';
import { GatewayImageModel } from './gateway-image-model';
import { GatewayLanguageModel } from './gateway-language-model';
import { createGateway } from './gateway-provider';
import { GatewayRerankingModel } from './gateway-reranking-model';
import { GatewaySpeechModel } from './gateway-speech-model';
import { GatewayTranscriptionModel } from './gateway-transcription-model';
import { GatewayVideoModel } from './gateway-video-model';
import { getVercelRequestId } from './vercel-environment';

vi.mock('./gateway-batch', () => ({ GatewayBatch: vi.fn(function () {}) }));
vi.mock('./gateway-decision-model', () => ({
  GatewayDecisionModel: vi.fn(function () {}),
}));
vi.mock('./gateway-embedding-model', () => ({
  GatewayEmbeddingModel: vi.fn(function () {}),
}));
vi.mock('./gateway-image-model', () => ({
  GatewayImageModel: vi.fn(function () {}),
}));
vi.mock('./gateway-language-model', () => ({
  GatewayLanguageModel: vi.fn(function () {}),
}));
vi.mock('./gateway-reranking-model', () => ({
  GatewayRerankingModel: vi.fn(function () {}),
}));
vi.mock('./gateway-speech-model', () => ({
  GatewaySpeechModel: vi.fn(function () {}),
}));
vi.mock('./gateway-transcription-model', () => ({
  GatewayTranscriptionModel: vi.fn(function () {}),
}));
vi.mock('./gateway-video-model', () => ({
  GatewayVideoModel: vi.fn(function () {}),
}));
vi.mock('./vercel-environment', () => ({
  getVercelOidcToken: vi.fn(),
  getVercelRequestId: vi.fn(),
}));
vi.mock('./version', () => ({ VERSION: '0.0.0-test' }));

type ModelSettings = {
  provider: string;
  baseURL: string;
  headers: () => Promise<Record<string, string | undefined>>;
  fetch: unknown;
  o11yHeaders: () => Promise<Record<string, string>>;
};

async function resolveSettings(settings: ModelSettings) {
  return {
    ...settings,
    headers: await resolve(settings.headers),
    o11yHeaders: await resolve(settings.o11yHeaders),
  };
}

const gateway = createGateway();

describe.each([
  {
    modality: 'language',
    createDefault: createDefaultGatewayLanguageModel,
    createFromProvider: gateway.languageModel,
    modelClass: GatewayLanguageModel,
  },
  {
    modality: 'embedding',
    createDefault: createDefaultGatewayEmbeddingModel,
    createFromProvider: gateway.embeddingModel,
    modelClass: GatewayEmbeddingModel,
  },
  {
    modality: 'image',
    createDefault: createDefaultGatewayImageModel,
    createFromProvider: gateway.imageModel,
    modelClass: GatewayImageModel,
  },
  {
    modality: 'video',
    createDefault: createDefaultGatewayVideoModel,
    createFromProvider: gateway.videoModel,
    modelClass: GatewayVideoModel,
  },
  {
    modality: 'reranking',
    createDefault: createDefaultGatewayRerankingModel,
    createFromProvider: gateway.rerankingModel,
    modelClass: GatewayRerankingModel,
  },
  {
    modality: 'decision',
    createDefault: createDefaultGatewayDecisionModel,
    createFromProvider: gateway.decisionModel,
    modelClass: GatewayDecisionModel,
  },
  {
    modality: 'speech',
    createDefault: createDefaultGatewaySpeechModel,
    createFromProvider: gateway.speechModel,
    modelClass: GatewaySpeechModel,
  },
  {
    modality: 'transcription',
    createDefault: createDefaultGatewayTranscriptionModel,
    createFromProvider: gateway.transcriptionModel,
    modelClass: GatewayTranscriptionModel,
  },
])(
  'createDefaultGateway $modality model',
  ({ createDefault, createFromProvider, modelClass }) => {
    beforeEach(() => {
      vi.stubEnv('AI_GATEWAY_API_KEY', 'test-api-key');
      vi.stubEnv('VERCEL_ENV', 'production');
      vi.mocked(getVercelRequestId).mockResolvedValue('test-request-id');
    });

    afterEach(() => {
      vi.unstubAllEnvs();
      vi.clearAllMocks();
    });

    it('should create the model with the same settings as the default gateway provider', async () => {
      createDefault('test-model');
      createFromProvider('test-model');

      const [defaultCall, providerCall] = vi.mocked(modelClass).mock.calls;

      expect(defaultCall[0]).toBe('test-model');
      expect(
        await resolveSettings(defaultCall[1] as unknown as ModelSettings),
      ).toEqual(
        await resolveSettings(providerCall[1] as unknown as ModelSettings),
      );
    });

    it('should resolve the default gateway settings', async () => {
      createDefault('test-model');

      const settings = vi.mocked(modelClass).mock.calls[0][1];

      expect(
        await resolveSettings(settings as unknown as ModelSettings),
      ).toEqual({
        provider: 'gateway',
        baseURL: 'https://ai-gateway.vercel.sh/v4/ai',
        headers: {
          authorization: 'Bearer test-api-key',
          'ai-gateway-protocol-version': expect.any(String),
          'ai-gateway-auth-method': 'api-key',
          'user-agent': 'ai-sdk-gateway/0.0.0-test',
        },
        fetch: undefined,
        o11yHeaders: {
          'ai-o11y-environment': 'production',
          'ai-o11y-request-id': 'test-request-id',
        },
      });
    });
  },
);

describe('createDefaultGatewayBatch', () => {
  beforeEach(() => {
    vi.stubEnv('AI_GATEWAY_API_KEY', 'test-api-key');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('should create the batch API with the same settings as the default gateway provider', async () => {
    createDefaultGatewayBatch();
    gateway.experimental_batch();

    const [defaultCall, providerCall] = vi.mocked(GatewayBatch).mock.calls;

    expect(
      await resolveSettings(defaultCall[0] as unknown as ModelSettings),
    ).toEqual(
      await resolveSettings(providerCall[0] as unknown as ModelSettings),
    );
  });
});
