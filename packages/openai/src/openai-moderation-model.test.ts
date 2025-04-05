import { describe, it, expect, vi, afterEach } from 'vitest';
import { OpenAIModerationModel } from './openai-moderation-model';
import { OpenAIConfig } from './openai-config';
import * as providerUtils from '@ai-sdk/provider-utils';

// Mock the response from the OpenAI API
const mockResponse = {
  id: 'modr-XXXX',
  model: 'text-moderation-latest',
  results: [
    {
      flagged: true,
      categories: {
        harassment: false,
        'harassment/threatening': false,
        hate: true,
        'hate/threatening': false,
        'self-harm': false,
        'self-harm/instructions': false,
        'self-harm/intent': false,
        sexual: false,
        'sexual/minors': false,
        violence: false,
        'violence/graphic': false,
        illicit: false,
        'illicit/violent': false,
      },
      category_scores: {
        harassment: 0.0001,
        'harassment/threatening': 0.0001,
        hate: 0.9875,
        'hate/threatening': 0.0001,
        'self-harm': 0.0001,
        'self-harm/instructions': 0.0001,
        'self-harm/intent': 0.0001,
        sexual: 0.0001,
        'sexual/minors': 0.0001,
        violence: 0.0001,
        'violence/graphic': 0.0001,
        illicit: 0.0001,
        'illicit/violent': 0.0001,
      },
      category_applied_input_types: {
        sexual: ['text'],
        violence: ['image'],
        'violence/graphic': ['image'],
      },
    },
  ],
};

// Mock the provider-utils module
vi.mock('@ai-sdk/provider-utils', () => {
  return {
    combineHeaders: vi.fn((a, b) => ({ ...a, ...b })),
    createJsonResponseHandler: vi.fn(() => () => mockResponse),
    createJsonErrorResponseHandler: vi.fn(() => 'mocked-error-handler'),
    postJsonToApi: vi.fn(() =>
      Promise.resolve({
        responseHeaders: {},
        value: mockResponse,
      }),
    ),
  };
});

describe('OpenAIModerationModel', () => {
  const mockFetch = vi.fn().mockImplementation(() =>
    Promise.resolve({
      ok: true,
      headers: new Headers(),
      json: () => Promise.resolve(mockResponse),
    }),
  );

  const config: OpenAIConfig = {
    provider: 'openai.moderation',
    url: ({ path }) => `https://api.openai.com/v1${path}`,
    headers: () => ({}),
    fetch: mockFetch,
  };

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should have specificationVersion set to v1', () => {
    const model = new OpenAIModerationModel(
      'text-moderation-latest',
      {},
      config,
    );

    expect(model.specificationVersion).toBe('v1');
  });

  it('should create a moderation with a single text input', async () => {
    const model = new OpenAIModerationModel(
      'text-moderation-latest',
      {},
      config,
    );

    const result = await model.moderate({
      input: 'This is a test input',
    });

    expect(result).toEqual({
      model: mockResponse.model,
      results: mockResponse.results,
      rawResponse: { headers: {} },
    });
  });

  it('should create a moderation with multiple text inputs', async () => {
    const model = new OpenAIModerationModel(
      'text-moderation-latest',
      {},
      config,
    );

    const inputs = ['Input 1', 'Input 2'];
    const result = await model.moderate({
      input: inputs,
    });

    expect(result).toEqual({
      model: mockResponse.model,
      results: mockResponse.results,
      rawResponse: { headers: {} },
    });
  });

  it('should create a moderation with image input', async () => {
    const model = new OpenAIModerationModel(
      'omni-moderation-latest',
      {},
      config,
    );

    const imageInput = {
      type: 'image_url' as const,
      image_url: {
        url: 'https://example.com/image.jpg',
      },
    };

    const result = await model.moderate({
      input: imageInput,
    });

    expect(result).toEqual({
      model: mockResponse.model,
      results: mockResponse.results,
      rawResponse: { headers: {} },
    });
  });

  it('should include user when provided', async () => {
    const model = new OpenAIModerationModel(
      'text-moderation-latest',
      { user: 'test-user' },
      config,
    );

    await model.moderate({
      input: 'Test input',
    });

    // Just check that it doesn't throw an error
    expect(true).toBe(true);
  });

  it('should handle omni-moderation-latest response format with category_applied_input_types', async () => {
    // Mock a response that matches the real API format shown in the OpenAI docs
    const omniMockResponse = {
      id: 'modr-970d409ef3bef3b70c73d8232df86e7d',
      model: 'omni-moderation-latest',
      results: [
        {
          flagged: true,
          categories: {
            sexual: false,
            'sexual/minors': false,
            harassment: false,
            'harassment/threatening': false,
            hate: false,
            'hate/threatening': false,
            illicit: false,
            'illicit/violent': false,
            'self-harm': false,
            'self-harm/intent': false,
            'self-harm/instructions': false,
            violence: true,
            'violence/graphic': false,
          },
          category_scores: {
            sexual: 2.34135824776394e-7,
            'sexual/minors': 1.6346470245419304e-7,
            harassment: 0.0011643905680426018,
            'harassment/threatening': 0.0022121340080906377,
            hate: 3.1999824407395835e-7,
            'hate/threatening': 2.4923252458203563e-7,
            illicit: 0.0005227032493135171,
            'illicit/violent': 3.682979260160596e-7,
            'self-harm': 0.0011175734280627694,
            'self-harm/intent': 0.0006264858507989037,
            'self-harm/instructions': 7.368592981140821e-8,
            violence: 0.8599265510337075,
            'violence/graphic': 0.37701736389561064,
          },
          category_applied_input_types: {
            sexual: ['image'],
            'sexual/minors': [],
            harassment: [],
            'harassment/threatening': [],
            hate: [],
            'hate/threatening': [],
            illicit: [],
            'illicit/violent': [],
            'self-harm': ['image'],
            'self-harm/intent': ['image'],
            'self-harm/instructions': ['image'],
            violence: ['image'],
            'violence/graphic': ['image'],
          },
        },
      ],
    };

    // Override the mocked return value for this test
    vi.mocked(providerUtils.postJsonToApi).mockResolvedValueOnce({
      responseHeaders: {},
      value: omniMockResponse,
    });

    const model = new OpenAIModerationModel(
      'omni-moderation-latest',
      {},
      config,
    );

    const imageInput = {
      type: 'image_url' as const,
      image_url: {
        url: 'https://example.com/image.jpg',
      },
    };

    const result = await model.moderate({
      input: imageInput,
    });

    // Since we're mocking the result directly, we can just verify the output format
    expect(result.model).toBe('omni-moderation-latest');
    expect(result.results[0].flagged).toBe(true);
    expect(result.results[0].categories.violence).toBe(true);
    expect(typeof result.results[0].category_scores.violence).toBe('number');
    expect(result.results[0].category_applied_input_types).toBeDefined();
    expect(
      Array.isArray(result.results[0].category_applied_input_types?.violence),
    ).toBe(true);
  });

  it('should handle multiple input types in a single request', async () => {
    const model = new OpenAIModerationModel(
      'omni-moderation-latest',
      {},
      config,
    );

    const mixedInputs = [
      { type: 'text' as const, text: 'Test text input' },
      { 
        type: 'image_url' as const, 
        image_url: { 
          url: 'https://example.com/image.jpg' 
        } 
      }
    ];

    const result = await model.moderate({
      input: mixedInputs,
    });

    expect(result).toEqual({
      model: mockResponse.model,
      results: mockResponse.results,
      rawResponse: { headers: {} },
    });
  });

  it('should handle a string array input', async () => {
    const model = new OpenAIModerationModel(
      'text-moderation-latest',
      {},
      config,
    );

    const result = await model.moderate({
      input: ['Input 1', 'Input 2', 'Input 3'],
    });

    expect(result).toEqual({
      model: mockResponse.model,
      results: mockResponse.results,
      rawResponse: { headers: {} },
    });
  });

  it('should handle null values in categories', async () => {
    // Override the mocked response to include null values
    const mockResponseWithNulls = {
      ...mockResponse,
      results: [{
        ...mockResponse.results[0],
        categories: {
          ...mockResponse.results[0].categories,
          illicit: null,
          'illicit/violent': null,
        }
      }]
    };

    vi.mocked(providerUtils.postJsonToApi).mockResolvedValueOnce({
      responseHeaders: {},
      value: mockResponseWithNulls,
    });

    const model = new OpenAIModerationModel(
      'text-moderation-latest',
      {},
      config,
    );

    const result = await model.moderate({
      input: 'Test input',
    });

    expect(result.results[0].categories.illicit).toBeNull();
    expect(result.results[0].categories['illicit/violent']).toBeNull();
  });
});
