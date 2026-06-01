import { describe, expect, it } from 'vitest';
import {
  GATEWAY_AUTH_SUBPROTOCOL_PREFIX,
  GATEWAY_REALTIME_SUBPROTOCOL,
  GatewayRealtimeModel,
} from './gateway-realtime-model';
import { createGateway } from './gateway-provider';

const createTestModel = (
  modelId = 'openai/gpt-realtime',
  baseURL = 'https://ai-gateway.vercel.sh/v4/ai',
  token = 'vck_test-token',
) =>
  new GatewayRealtimeModel(modelId, {
    provider: 'gateway.realtime',
    baseURL,
    getAuthToken: async () => ({ token, authMethod: 'api-key' }),
  });

describe('GatewayRealtimeModel', () => {
  it('exposes the v4 specification, provider, and model id', () => {
    const model = createTestModel();
    expect(model.specificationVersion).toBe('v4');
    expect(model.provider).toBe('gateway.realtime');
    expect(model.modelId).toBe('openai/gpt-realtime');
  });

  describe('doCreateClientSecret', () => {
    it('returns the gateway auth token and a wss realtime url with the model query', async () => {
      const result = await createTestModel().doCreateClientSecret();
      expect(result.token).toBe('vck_test-token');
      expect(result.url).toBe(
        'wss://ai-gateway.vercel.sh/v4/ai/realtime-model?model=openai%2Fgpt-realtime',
      );
    });

    it('upgrades an http base url to ws (local development)', async () => {
      const result = await createTestModel(
        'openai/gpt-realtime',
        'http://localhost:3000/v4/ai',
      ).doCreateClientSecret();
      expect(result.url).toBe(
        'ws://localhost:3000/v4/ai/realtime-model?model=openai%2Fgpt-realtime',
      );
    });
  });

  describe('getWebSocketConfig', () => {
    it('smuggles the bearer token through the subprotocol (browser has no header channel)', () => {
      const config = createTestModel().getWebSocketConfig({
        token: 'vck_test-token',
        url: 'wss://ai-gateway.vercel.sh/v4/ai/realtime-model?model=openai%2Fgpt-realtime',
      });
      expect(config.url).toBe(
        'wss://ai-gateway.vercel.sh/v4/ai/realtime-model?model=openai%2Fgpt-realtime',
      );
      expect(config.protocols).toEqual([
        GATEWAY_REALTIME_SUBPROTOCOL,
        `${GATEWAY_AUTH_SUBPROTOCOL_PREFIX}vck_test-token`,
      ]);
    });
  });

  describe('normalized identity codec', () => {
    it('passes server events through unchanged', () => {
      const event = { type: 'response-created', responseId: 'resp_1', raw: {} };
      expect(createTestModel().parseServerEvent(event)).toBe(event);
    });

    it('passes client events through unchanged', () => {
      const event = { type: 'response-create' } as const;
      expect(createTestModel().serializeClientEvent(event)).toBe(event);
    });

    it('passes session config through unchanged', () => {
      const config = { instructions: 'be concise', voice: 'alloy' };
      expect(createTestModel().buildSessionConfig(config)).toBe(config);
    });
  });
});

describe('gateway.experimental_realtime', () => {
  const gateway = createGateway({ apiKey: 'vck_test-token' });

  it('creates a realtime model from a model id', () => {
    const model = gateway.experimental_realtime('openai/gpt-realtime');
    expect(model.specificationVersion).toBe('v4');
    expect(model.modelId).toBe('openai/gpt-realtime');
    expect(model.provider).toBe('gateway.realtime');
  });

  it('mints a token + url via getToken', async () => {
    const result = await gateway.experimental_realtime.getToken({
      model: 'openai/gpt-realtime',
    });
    expect(result.token).toBe('vck_test-token');
    expect(result.url).toBe(
      'wss://ai-gateway.vercel.sh/v4/ai/realtime-model?model=openai%2Fgpt-realtime',
    );
  });
});
