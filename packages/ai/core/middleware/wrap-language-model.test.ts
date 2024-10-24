import { LanguageModelV1CallOptions } from '@ai-sdk/provider';
import { experimental_wrapLanguageModel } from '../middleware/wrap-language-model';
import { MockLanguageModelV1 } from '../test/mock-language-model-v1';

it('should pass through model properties', () => {
  const wrappedModel = experimental_wrapLanguageModel({
    model: new MockLanguageModelV1({
      provider: 'test-provider',
      modelId: 'test-model',
      defaultObjectGenerationMode: 'json',
      supportsStructuredOutputs: true,
    }),
    middleware: {},
  });

  expect(wrappedModel.provider).toBe('test-provider');
  expect(wrappedModel.modelId).toBe('test-model');
  expect(wrappedModel.defaultObjectGenerationMode).toBe('json');
  expect(wrappedModel.supportsStructuredOutputs).toBe(true);
});

it('should override provider and modelId if provided', () => {
  const wrappedModel = experimental_wrapLanguageModel({
    model: new MockLanguageModelV1(),
    middleware: {},
    providerId: 'override-provider',
    modelId: 'override-model',
  });

  expect(wrappedModel.provider).toBe('override-provider');
  expect(wrappedModel.modelId).toBe('override-model');
});

it('should call transformParams middleware for doGenerate', async () => {
  const mockModel = new MockLanguageModelV1({
    doGenerate: vi.fn().mockResolvedValue('mock result'),
  });
  const transformParams = vi.fn().mockImplementation(({ params }) => ({
    ...params,
    transformed: true,
  }));

  const wrappedModel = experimental_wrapLanguageModel({
    model: mockModel,
    middleware: { transformParams },
  });

  const params: LanguageModelV1CallOptions = {
    inputFormat: 'messages',
    prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
    mode: { type: 'regular' },
  };

  await wrappedModel.doGenerate(params);

  expect(transformParams).toHaveBeenCalledWith({
    params,
    type: 'generate',
  });

  expect(mockModel.doGenerate).toHaveBeenCalledWith({
    ...params,
    transformed: true,
  });
});

it('should call wrapGenerate middleware', async () => {
  const mockModel = new MockLanguageModelV1({
    doGenerate: vi.fn().mockResolvedValue('mock result'),
  });
  const wrapGenerate = vi
    .fn()
    .mockImplementation(({ doGenerate }) => doGenerate());

  const wrappedModel = experimental_wrapLanguageModel({
    model: mockModel,
    middleware: { wrapGenerate },
  });

  const params: LanguageModelV1CallOptions = {
    inputFormat: 'messages',
    prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
    mode: { type: 'regular' },
  };

  await wrappedModel.doGenerate(params);

  expect(wrapGenerate).toHaveBeenCalledWith({
    doGenerate: expect.any(Function),
    params,
    model: mockModel,
  });
});

it('should call transformParams middleware for doStream', async () => {
  const mockModel = new MockLanguageModelV1({
    doStream: vi.fn().mockResolvedValue('mock stream'),
  });
  const transformParams = vi.fn().mockImplementation(({ params }) => ({
    ...params,
    transformed: true,
  }));

  const wrappedModel = experimental_wrapLanguageModel({
    model: mockModel,
    middleware: { transformParams },
  });

  const params: LanguageModelV1CallOptions = {
    inputFormat: 'messages',
    prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
    mode: { type: 'regular' },
  };

  await wrappedModel.doStream(params);

  expect(transformParams).toHaveBeenCalledWith({
    params,
    type: 'stream',
  });
  expect(mockModel.doStream).toHaveBeenCalledWith({
    ...params,
    transformed: true,
  });
});

it('should call wrapStream middleware', async () => {
  const mockModel = new MockLanguageModelV1({
    doStream: vi.fn().mockResolvedValue('mock stream'),
  });
  const wrapStream = vi.fn().mockImplementation(({ doStream }) => doStream());

  const wrappedModel = experimental_wrapLanguageModel({
    model: mockModel,
    middleware: { wrapStream },
  });

  const params: LanguageModelV1CallOptions = {
    inputFormat: 'messages',
    prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
    mode: { type: 'regular' },
  };

  await wrappedModel.doStream(params);

  expect(wrapStream).toHaveBeenCalledWith({
    doStream: expect.any(Function),
    params,
    model: mockModel,
  });
});

it('should pass through empty supportsUrl', async () => {
  const mockModel = new MockLanguageModelV1({
    doGenerate: vi.fn().mockResolvedValue('mock result'),
  });

  const wrappedModel = experimental_wrapLanguageModel({
    model: mockModel,
    middleware: {},
  });

  expect(wrappedModel.supportsUrl).toBeUndefined();
});

it('should pass through supportsUrl when it is defined on the model', async () => {
  const mockModel = new MockLanguageModelV1({
    doGenerate: vi.fn().mockResolvedValue('mock result'),
    supportsUrl: vi.fn().mockReturnValue(true),
  });

  const wrappedModel = experimental_wrapLanguageModel({
    model: mockModel,
    middleware: {},
  });

  expect(
    wrappedModel.supportsUrl?.(new URL('https://example.com/test.jpg')),
  ).toBe(true);
});
