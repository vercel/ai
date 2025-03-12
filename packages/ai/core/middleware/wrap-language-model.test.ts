import { LanguageModelV1, LanguageModelV1CallOptions } from '@ai-sdk/provider';
import { wrapLanguageModel } from '../middleware/wrap-language-model';
import { MockLanguageModelV1 } from '../test/mock-language-model-v1';

describe('wrapLanguageModel', () => {
  it('should pass through model properties', () => {
    const wrappedModel = wrapLanguageModel({
      model: new MockLanguageModelV1({
        provider: 'test-provider',
        modelId: 'test-model',
        defaultObjectGenerationMode: 'json',
        supportsStructuredOutputs: true,
      }),
      middleware: {
        middlewareVersion: 'v1',
      },
    });

    expect(wrappedModel.provider).toBe('test-provider');
    expect(wrappedModel.modelId).toBe('test-model');
    expect(wrappedModel.defaultObjectGenerationMode).toBe('json');
    expect(wrappedModel.supportsStructuredOutputs).toBe(true);
  });

  it('should override provider and modelId if provided', () => {
    const wrappedModel = wrapLanguageModel({
      model: new MockLanguageModelV1(),
      middleware: {
        middlewareVersion: 'v1',
      },
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

    const wrappedModel = wrapLanguageModel({
      model: mockModel,
      middleware: {
        middlewareVersion: 'v1',
        transformParams,
      },
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

    const wrappedModel = wrapLanguageModel({
      model: mockModel,
      middleware: {
        middlewareVersion: 'v1',
        wrapGenerate,
      },
    });

    const params: LanguageModelV1CallOptions = {
      inputFormat: 'messages',
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
      mode: { type: 'regular' },
    };

    await wrappedModel.doGenerate(params);

    expect(wrapGenerate).toHaveBeenCalledWith({
      doGenerate: expect.any(Function),
      doStream: expect.any(Function),
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

    const wrappedModel = wrapLanguageModel({
      model: mockModel,
      middleware: {
        middlewareVersion: 'v1',
        transformParams,
      },
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

    const wrappedModel = wrapLanguageModel({
      model: mockModel,
      middleware: {
        middlewareVersion: 'v1',
        wrapStream,
      },
    });

    const params: LanguageModelV1CallOptions = {
      inputFormat: 'messages',
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
      mode: { type: 'regular' },
    };

    await wrappedModel.doStream(params);

    expect(wrapStream).toHaveBeenCalledWith({
      doGenerate: expect.any(Function),
      doStream: expect.any(Function),
      params,
      model: mockModel,
    });
  });

  it('should pass through empty supportsUrl', async () => {
    const mockModel = new MockLanguageModelV1({
      doGenerate: vi.fn().mockResolvedValue('mock result'),
    });

    const wrappedModel = wrapLanguageModel({
      model: mockModel,
      middleware: {
        middlewareVersion: 'v1',
      },
    });

    expect(wrappedModel.supportsUrl).toBeUndefined();
  });

  it('should pass through supportsUrl when it is defined on the model', async () => {
    const mockModel = new MockLanguageModelV1({
      doGenerate: vi.fn().mockResolvedValue('mock result'),
      supportsUrl: vi.fn().mockReturnValue(true),
    });

    const wrappedModel = wrapLanguageModel({
      model: mockModel,
      middleware: {
        middlewareVersion: 'v1',
      },
    });

    expect(
      wrappedModel.supportsUrl?.(new URL('https://example.com/test.jpg')),
    ).toBe(true);
  });

  it('should support models that use "this" context in supportsUrl', async () => {
    let supportsUrlCalled = false;

    class MockLanguageModelWithImageSupport implements LanguageModelV1 {
      readonly specificationVersion = 'v1';
      readonly provider = 'test-provider';
      readonly modelId = 'test-model';
      readonly defaultObjectGenerationMode = 'json';
      readonly supportsImageUrls = false;

      readonly doGenerate: LanguageModelV1['doGenerate'] = vi.fn();
      readonly doStream: LanguageModelV1['doStream'] = vi.fn();

      private readonly value = true;

      supportsUrl(url: URL) {
        supportsUrlCalled = true;
        // Reference 'this' to verify context
        return this.value;
      }
    }

    const wrappedModel = wrapLanguageModel({
      model: new MockLanguageModelWithImageSupport(),
      middleware: {
        middlewareVersion: 'v1',
      },
    });

    expect(
      wrappedModel.supportsUrl?.(new URL('https://example.com/test.jpg')),
    ).toBe(true);
    expect(supportsUrlCalled).toBe(true);
  });

  describe('wrapLanguageModel with multiple middlewares', () => {
    it('should call multiple transformParams middlewares in sequence for doGenerate', async () => {
      const mockModel = new MockLanguageModelV1({
        doGenerate: vi.fn().mockResolvedValue('final result'),
      });

      const transformParams1 = vi.fn().mockImplementation(({ params }) => ({
        ...params,
        transformationStep1: true,
      }));
      const transformParams2 = vi.fn().mockImplementation(({ params }) => ({
        ...params,
        transformationStep2: true,
      }));

      const wrappedModel = wrapLanguageModel({
        model: mockModel,
        middleware: [
          {
            middlewareVersion: 'v1',
            transformParams: transformParams1,
          },
          {
            middlewareVersion: 'v1',
            transformParams: transformParams2,
          },
        ],
      });

      const params: LanguageModelV1CallOptions = {
        inputFormat: 'messages',
        prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
        mode: { type: 'regular' },
      };

      await wrappedModel.doGenerate(params);

      expect(transformParams1).toHaveBeenCalledWith({
        params,
        type: 'generate',
      });

      expect(transformParams2).toHaveBeenCalledWith({
        params: { ...params, transformationStep1: true },
        type: 'generate',
      });

      expect(mockModel.doGenerate).toHaveBeenCalledWith(
        expect.objectContaining({
          transformationStep1: true,
          transformationStep2: true,
        }),
      );
    });

    it('should call multiple transformParams middlewares in sequence for doStream', async () => {
      const mockModel = new MockLanguageModelV1({
        doStream: vi.fn().mockResolvedValue('final stream'),
      });

      const transformParams1 = vi.fn().mockImplementation(({ params }) => ({
        ...params,
        transformationStep1: true,
      }));
      const transformParams2 = vi.fn().mockImplementation(({ params }) => ({
        ...params,
        transformationStep2: true,
      }));

      const wrappedModel = wrapLanguageModel({
        model: mockModel,
        middleware: [
          {
            middlewareVersion: 'v1',
            transformParams: transformParams1,
          },
          {
            middlewareVersion: 'v1',
            transformParams: transformParams2,
          },
        ],
      });

      const params: LanguageModelV1CallOptions = {
        inputFormat: 'messages',
        prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
        mode: { type: 'regular' },
      };

      await wrappedModel.doStream(params);

      expect(transformParams1).toHaveBeenCalledWith({
        params,
        type: 'stream',
      });
      expect(transformParams2).toHaveBeenCalledWith({
        params: expect.objectContaining({ transformationStep1: true }),
        type: 'stream',
      });
      expect(mockModel.doStream).toHaveBeenCalledWith(
        expect.objectContaining({
          transformationStep1: true,
          transformationStep2: true,
        }),
      );
    });

    it('should chain multiple wrapGenerate middlewares in the correct order', async () => {
      const mockModel = new MockLanguageModelV1({
        doGenerate: vi.fn().mockResolvedValue('final generate result'),
      });

      const wrapGenerate1 = vi
        .fn()
        .mockImplementation(async ({ doGenerate, params, model }) => {
          const result = await doGenerate();
          return `wrapGenerate1(${result})`;
        });
      const wrapGenerate2 = vi
        .fn()
        .mockImplementation(async ({ doGenerate, params, model }) => {
          const result = await doGenerate();
          return `wrapGenerate2(${result})`;
        });

      const wrappedModel = wrapLanguageModel({
        model: mockModel,
        middleware: [
          {
            middlewareVersion: 'v1',
            wrapGenerate: wrapGenerate1,
          },
          {
            middlewareVersion: 'v1',
            wrapGenerate: wrapGenerate2,
          },
        ],
      });

      const params: LanguageModelV1CallOptions = {
        inputFormat: 'messages',
        prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
        mode: { type: 'regular' },
      };

      const result = await wrappedModel.doGenerate(params);

      // The middlewares should wrap in order, applying wrapGenerate2 last
      expect(result).toBe(
        'wrapGenerate1(wrapGenerate2(final generate result))',
      );
      expect(wrapGenerate1).toHaveBeenCalled();
      expect(wrapGenerate2).toHaveBeenCalled();
    });

    it('should chain multiple wrapStream middlewares in the correct order', async () => {
      const mockModel = new MockLanguageModelV1({
        doStream: vi.fn().mockResolvedValue('final stream result'),
      });

      const wrapStream1 = vi
        .fn()
        .mockImplementation(async ({ doStream, params, model }) => {
          const result = await doStream();
          return `wrapStream1(${result})`;
        });
      const wrapStream2 = vi
        .fn()
        .mockImplementation(async ({ doStream, params, model }) => {
          const result = await doStream();
          return `wrapStream2(${result})`;
        });

      const wrappedModel = wrapLanguageModel({
        model: mockModel,
        middleware: [
          {
            middlewareVersion: 'v1',
            wrapStream: wrapStream1,
          },
          {
            middlewareVersion: 'v1',
            wrapStream: wrapStream2,
          },
        ],
      });

      const params: LanguageModelV1CallOptions = {
        inputFormat: 'messages',
        prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
        mode: { type: 'regular' },
      };

      const result = await wrappedModel.doStream(params);

      // The middlewares should wrap in order, applying wrapStream2 last
      expect(result).toBe('wrapStream1(wrapStream2(final stream result))');
      expect(wrapStream1).toHaveBeenCalled();
      expect(wrapStream2).toHaveBeenCalled();
    });
  });
});
