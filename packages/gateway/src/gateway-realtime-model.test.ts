import type { Experimental_RealtimeModelV4ClientEvent as RealtimeClientEvent } from '@ai-sdk/provider';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GatewayAuthenticationError } from './errors';
import {
  GATEWAY_AUTH_SUBPROTOCOL_PREFIX,
  GATEWAY_REALTIME_SUBPROTOCOL,
  getGatewayRealtimeTeamIdOrSlug,
} from './gateway-realtime-auth';
import { GatewayRealtimeModel } from './gateway-realtime-model';
import { createGateway } from './gateway-provider';
import { getVercelOidcToken } from './vercel-environment';

vi.mock('./vercel-environment', () => ({
  getVercelOidcToken: vi.fn(),
  getVercelRequestId: vi.fn(),
}));

const serverOnlyDescribe =
  typeof globalThis.window === 'undefined' ? describe : describe.skip;
const serverOnlyIt = typeof globalThis.window === 'undefined' ? it : it.skip;

const createTestModel = (
  modelId = 'openai/gpt-realtime',
  baseURL = 'https://ai-gateway.vercel.sh/v4/ai',
  token = 'vck_test-token',
  teamIdOrSlug?: string,
) =>
  new GatewayRealtimeModel(modelId, {
    provider: 'gateway.realtime',
    baseURL,
    ...(teamIdOrSlug !== undefined && { teamIdOrSlug }),
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
    it('returns the gateway auth token and a wss realtime url with the ai-model-id query', async () => {
      const result = await createTestModel().doCreateClientSecret();
      expect(result.token).toBe('vck_test-token');
      expect(result.url).toBe(
        'wss://ai-gateway.vercel.sh/v4/ai/realtime-model?ai-model-id=openai%2Fgpt-realtime',
      );
    });

    it('upgrades an http base url to ws (local development)', async () => {
      const result = await createTestModel(
        'openai/gpt-realtime',
        'http://localhost:3000/v4/ai',
      ).doCreateClientSecret();
      expect(result.url).toBe(
        'ws://localhost:3000/v4/ai/realtime-model?ai-model-id=openai%2Fgpt-realtime',
      );
    });

    it('passes the model id through verbatim (the gateway owns qualification)', async () => {
      const result =
        await createTestModel('gpt-realtime-2').doCreateClientSecret();
      // No client-side `openai/` prefixing — mirrors the non-realtime routes.
      expect(result.url).toBe(
        'wss://ai-gateway.vercel.sh/v4/ai/realtime-model?ai-model-id=gpt-realtime-2',
      );
    });

    it('returns an oidc token unchanged', async () => {
      const model = new GatewayRealtimeModel('openai/gpt-realtime-2', {
        provider: 'gateway.realtime',
        baseURL: 'https://ai-gateway.vercel.sh/v4/ai',
        getAuthToken: async () => ({
          token: 'oidc-token',
          authMethod: 'oidc',
        }),
      });
      const result = await model.doCreateClientSecret();
      expect(result.token).toBe('oidc-token');
    });
  });

  describe('getWebSocketConfig', () => {
    it('smuggles the bearer token through the subprotocol (browser has no header channel)', () => {
      const config = createTestModel().getWebSocketConfig({
        token: 'vck_test-token',
        url: 'wss://ai-gateway.vercel.sh/v4/ai/realtime-model?ai-model-id=openai%2Fgpt-realtime',
      });
      expect(config.url).toBe(
        'wss://ai-gateway.vercel.sh/v4/ai/realtime-model?ai-model-id=openai%2Fgpt-realtime',
      );
      expect(config.protocols).toEqual([
        GATEWAY_REALTIME_SUBPROTOCOL,
        `${GATEWAY_AUTH_SUBPROTOCOL_PREFIX}vck_test-token`,
      ]);
    });

    it('smuggles optional team scoping through the subprotocol', () => {
      const config = createTestModel(
        'openai/gpt-realtime',
        'https://ai-gateway.vercel.sh/v4/ai',
        'vck_test-token',
        'team_123',
      ).getWebSocketConfig({
        token: 'vck_test-token',
        url: 'wss://ai-gateway.vercel.sh/v4/ai/realtime-model?ai-model-id=openai%2Fgpt-realtime',
      });

      expect(getGatewayRealtimeTeamIdOrSlug(config.protocols?.join(', '))).toBe(
        'team_123',
      );
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

    it('passes session-update provider options through unchanged', () => {
      // "Support all the things": gateway provider options (tags/user/byok/...)
      // ride session.update exactly as they ride the request body on the
      // non-realtime routes. The identity codec must not strip them.
      const event = {
        type: 'session-update',
        config: {
          instructions: 'be concise',
          providerOptions: {
            gateway: { tags: ['demo'], user: 'user-1' },
          },
        },
      } satisfies RealtimeClientEvent;
      expect(createTestModel().serializeClientEvent(event)).toBe(event);
    });
  });
});

describe('gateway.experimental_realtime', () => {
  const gateway = createGateway({ apiKey: 'vck_test-token' });

  serverOnlyIt('creates a realtime model from a model id', () => {
    const model = gateway.experimental_realtime('openai/gpt-realtime');
    expect(model.specificationVersion).toBe('v4');
    expect(model.modelId).toBe('openai/gpt-realtime');
    expect(model.provider).toBe('gateway.realtime');
  });

  serverOnlyIt('returns a Gateway auth token + url via getToken', async () => {
    const result = await gateway.experimental_realtime.getToken({
      model: 'openai/gpt-realtime',
    });
    expect(result.token).toBe('vck_test-token');
    expect(result.url).toBe(
      'wss://ai-gateway.vercel.sh/v4/ai/realtime-model?ai-model-id=openai%2Fgpt-realtime',
    );
  });

  serverOnlyIt(
    'carries teamIdOrSlug through realtime WebSocket protocols',
    () => {
      const scopedGateway = createGateway({
        apiKey: 'vck_test-token',
        teamIdOrSlug: 'my-team',
      });
      const model = scopedGateway.experimental_realtime('openai/gpt-realtime');
      const config = model.getWebSocketConfig({
        token: 'vck_test-token',
        url: 'wss://ai-gateway.vercel.sh/v4/ai/realtime-model?ai-model-id=openai%2Fgpt-realtime',
      });

      expect(getGatewayRealtimeTeamIdOrSlug(config.protocols?.join(', '))).toBe(
        'my-team',
      );
    },
  );

  it('rejects creating a realtime model in browsers', () => {
    withBrowserGlobal(() => {
      expect(() =>
        gateway.experimental_realtime('openai/gpt-realtime'),
      ).toThrow(/cannot be used in browsers/);
    });
  });

  it('rejects getToken in browsers', async () => {
    await withBrowserGlobal(async () => {
      await expect(
        gateway.experimental_realtime.getToken({
          model: 'openai/gpt-realtime',
        }),
      ).rejects.toThrow(/cannot be used in browsers/);
    });
  });
});

function withBrowserGlobal<T>(callback: () => T): T {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {},
  });

  try {
    return callback();
  } finally {
    if (descriptor) {
      Object.defineProperty(globalThis, 'window', descriptor);
    } else {
      Reflect.deleteProperty(globalThis, 'window');
    }
  }
}

serverOnlyDescribe('gateway.experimental_realtime auth errors', () => {
  let previousApiKey: string | undefined;

  beforeEach(() => {
    previousApiKey = process.env.AI_GATEWAY_API_KEY;
    Reflect.deleteProperty(process.env, 'AI_GATEWAY_API_KEY');
    vi.mocked(getVercelOidcToken).mockRejectedValue(
      new Error('no oidc token available'),
    );
  });

  afterEach(() => {
    if (previousApiKey !== undefined) {
      process.env.AI_GATEWAY_API_KEY = previousApiKey;
    }
    vi.clearAllMocks();
  });

  it('wraps getToken auth failures in a GatewayAuthenticationError', async () => {
    // No API key and no OIDC token: the realtime auth path must surface the
    // same GatewayAuthenticationError the other gateway models throw.
    const gateway = createGateway({});
    await expect(
      gateway.experimental_realtime.getToken({
        model: 'openai/gpt-realtime-2',
      }),
    ).rejects.toBeInstanceOf(GatewayAuthenticationError);
  });
});
