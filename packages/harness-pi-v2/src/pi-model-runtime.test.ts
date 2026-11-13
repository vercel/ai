import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  DEFAULT_PI_MODEL_ID,
  PI_CLIENT_APP,
  createPiModelRuntime,
} from './pi-model-runtime';

describe('createPiModelRuntime', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test('throws without an AI Gateway credential', () => {
    vi.stubEnv('AI_GATEWAY_API_KEY', '');
    vi.stubEnv('VERCEL_OIDC_TOKEN', '');

    expect(() => createPiModelRuntime()).toThrow(
      'Pi harness: no AI Gateway credential found. Set AI_GATEWAY_API_KEY or VERCEL_OIDC_TOKEN.',
    );
  });

  test('resolves AI Gateway models with the configured base URL', () => {
    vi.stubEnv('AI_GATEWAY_API_KEY', 'test-key');
    vi.stubEnv('AI_GATEWAY_BASE_URL', 'https://gateway.example.com');

    const model = createPiModelRuntime().resolveModel({
      modelId: DEFAULT_PI_MODEL_ID,
    });

    expect(model).toMatchObject({
      provider: 'vercel-ai-gateway',
      id: DEFAULT_PI_MODEL_ID,
      baseUrl: 'https://gateway.example.com',
    });
  });

  test('throws for a model AI Gateway does not offer', () => {
    vi.stubEnv('AI_GATEWAY_API_KEY', 'test-key');

    expect(() =>
      createPiModelRuntime().resolveModel({ modelId: 'unknown/model' }),
    ).toThrow(
      "Pi harness: the model 'unknown/model' is not available through AI Gateway.",
    );
  });

  test('identifies the client app', () => {
    expect(PI_CLIENT_APP).toBe('ai-sdk-harness-pi-v2/0.0.0-test');
  });
});
