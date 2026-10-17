import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it } from 'vitest';
import { createGateway } from './gateway-provider';

const modelsResponse = {
  object: 'list',
  data: [
    {
      id: 'anthropic/claude-sonnet-4.5',
      object: 'model',
      created: 1_755_815_280,
      owned_by: 'anthropic',
      name: 'Claude Sonnet 4.5',
      description: 'A capable language model.',
      context_window: 200_000,
      max_tokens: 64_000,
      type: 'language',
      tags: ['reasoning', 'tool-use'],
      pricing: {
        input: '0.000003',
        output: '0.000015',
      },
      service_owned_field: true,
    },
  ],
};

const modelEndpointsResponse = {
  data: {
    id: 'test-creator/test-model',
    name: 'Test Model',
    created: 1_755_815_280,
    description: 'A test model.',
    architecture: {
      modality: 'text→text',
      input_modalities: ['text'],
      output_modalities: ['text'],
    },
    endpoints: [
      {
        name: 'test-provider | test-creator/test-model',
        model_name: 'Test Model',
        provider_name: 'test-provider',
        context_length: 200_000,
        max_completion_tokens: 64_000,
        pricing: {
          prompt: '0.000003',
          completion: '0.000015',
        },
        supported_parameters: ['tools'],
        status: 0,
        supports_implicit_caching: false,
      },
    ],
  },
};

const server = createTestServer({
  'https://api.example.com/*': {
    response: {
      type: 'json-value',
      body: modelsResponse,
    },
  },
});

describe('GatewayRequest', () => {
  it('requests models from the Gateway REST API origin', async () => {
    const gateway = createGateway({
      baseURL: 'https://api.example.com/v4/ai',
    });

    const response = await gateway.request('GET /v1/models');

    expect(server.calls[0].requestMethod).toBe('GET');
    expect(server.calls[0].requestUrl).toBe(
      'https://api.example.com/v1/models',
    );
    expect(response).toEqual(modelsResponse);
  });

  it('requests model endpoints with encoded path parameters', async () => {
    server.urls['https://api.example.com/*'].response = {
      type: 'json-value',
      body: modelEndpointsResponse,
    };

    const gateway = createGateway({
      baseURL: 'https://api.example.com/v4/ai',
    });

    const response = await gateway.request(
      'GET /v1/models/{creator}/{model}/endpoints',
      {
        creator: 'test creator',
        model: 'test/model',
      },
    );

    const request = server.calls.at(-1)!;
    expect(request.requestMethod).toBe('GET');
    expect(request.requestUrl).toBe(
      'https://api.example.com/v1/models/test%20creator/test%2Fmodel/endpoints',
    );
    expect(response).toEqual(modelEndpointsResponse);
  });

  it('adds Gateway credentials to authenticated raw routes', async () => {
    server.urls['https://api.example.com/*'].response = {
      type: 'json-value',
      body: { balance: '100.00', total_used: '25.00' },
    };

    const gateway = createGateway({
      baseURL: 'https://api.example.com/v4/ai',
      apiKey: 'test-key',
    });

    const response = await gateway.request('GET /v1/credits');

    const request = server.calls.at(-1)!;
    expect(request.requestUrl).toBe('https://api.example.com/v1/credits');
    expect(request.requestHeaders.authorization).toBe('Bearer test-key');
    expect(response).toEqual({ balance: '100.00', total_used: '25.00' });
  });
});
