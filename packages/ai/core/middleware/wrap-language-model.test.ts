import { LanguageModelV2, LanguageModelV2CallOptions } from '@ai-sdk/provider';
import { wrapLanguageModel } from '../middleware/wrap-language-model';
import { MockLanguageModelV2 } from '../test/mock-language-model-v2';

describe('wrapLanguageModel', () => {
  it('should pass through model properties', () => {
    const wrappedModel = wrapLanguageModel({
      model: new MockLanguageModelV2({
        provider: 'test-provider',
        modelId: 'test-model',
      }),
      middleware: {
        middlewareVersion: 'v2',
      },
    });

    expect(wrappedModel.provider).toBe('test-provider');
    expect(wrappedModel.modelId).toBe('test-model');
  });

  it('should override provider and modelId if provided', () => {
    const wrappedModel = wrapLanguageModel({
      model: new MockLanguageModelV2(),
      middleware: {
        middlewareVersion: 'v2',
      },
      providerId: 'override-provider',
      modelId: 'override-model',
    });

    expect(wrappedModel.provider).toBe('override-provider');
    expect(wrappedModel.modelId).toBe('override-model');
  });

  it('should call transformParams middleware for doGenerate', async () => {
    const mockModel = new MockLanguageModelV2({
      doGenerate: [],
    });
    const transformParams = vi.fn().mockImplementation(({ params }) => ({
      ...params,
      transformed: true,
    }));

    const wrappedModel = wrapLanguageModel({
      model: mockModel,
      middleware: {
        middlewareVersion: 'v2',
        transformParams,
      },
    });

    const params: LanguageModelV2CallOptions = {
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
    };

    await wrappedModel.doGenerate(params);

    expect(transformParams).toHaveBeenCalledWith({
      params,
      type: 'generate',
    });

    expect(mockModel.doGenerateCalls[0]).toStrictEqual({
      ...params,
      transformed: true,
    });
  });

  it('should call wrapGenerate middleware', async () => {
    const mockModel = new MockLanguageModelV2({
      doGenerate: vi.fn().mockResolvedValue('mock result'),
    });
    const wrapGenerate = vi
      .fn()
      .mockImplementation(({ doGenerate }) => doGenerate());

    const wrappedModel = wrapLanguageModel({
      model: mockModel,
      middleware: {
        middlewareVersion: 'v2',
        wrapGenerate,
      },
    });

    const params: LanguageModelV2CallOptions = {
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
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
    const mockModel = new MockLanguageModelV2({
      doStream: [],
    });

    const transformParams = vi.fn().mockImplementation(({ params }) => ({
      ...params,
      transformed: true,
    }));

    const wrappedModel = wrapLanguageModel({
      model: mockModel,
      middleware: {
        middlewareVersion: 'v2',
        transformParams,
      },
    });

    const params: LanguageModelV2CallOptions = {
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
    };

    await wrappedModel.doStream(params);

    expect(transformParams).toHaveBeenCalledWith({
      params,
      type: 'stream',
    });
    expect(mockModel.doStreamCalls[0]).toStrictEqual({
      ...params,
      transformed: true,
    });
  });

  it('should call wrapStream middleware', async () => {
    const mockModel = new MockLanguageModelV2({
      doStream: vi.fn().mockResolvedValue('mock stream'),
    });
    const wrapStream = vi.fn().mockImplementation(({ doStream }) => doStream());

    const wrappedModel = wrapLanguageModel({
      model: mockModel,
      middleware: {
        middlewareVersion: 'v2',
        wrapStream,
      },
    });

    const params: LanguageModelV2CallOptions = {
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
    };

    await wrappedModel.doStream(params);

    expect(wrapStream).toHaveBeenCalledWith({
      doGenerate: expect.any(Function),
      doStream: expect.any(Function),
      params,
      model: mockModel,
    });
  });

  it('should pass through supportedUrls', async () => {
    const supportedUrls = {
      'image/*': [/^https:\/\/.*$/],
    };

    const wrappedModel = wrapLanguageModel({
      model: new MockLanguageModelV2({ supportedUrls }),
      middleware: {
        middlewareVersion: 'v2',
      },
    });

    expect(await wrappedModel.supportedUrls).toStrictEqual(supportedUrls);
  });

  it('should support models that use "this" context in supportedUrls', async () => {
    let supportedUrlsCalled = false;

    class MockLanguageModelWithImageSupport implements LanguageModelV2 {
      readonly specificationVersion = 'v2';
      readonly provider = 'test-provider';
      readonly modelId = 'test-model';

      readonly doGenerate: LanguageModelV2['doGenerate'] = vi.fn();
      readonly doStream: LanguageModelV2['doStream'] = vi.fn();

      readonly value = {
        'image/*': [/^https:\/\/.*$/],
      };

      get supportedUrls() {
        supportedUrlsCalled = true;
        // Reference 'this' to verify context
        return this.value;
      }
    }

    const model = new MockLanguageModelWithImageSupport();

    const wrappedModel = wrapLanguageModel({
      model,
      middleware: { middlewareVersion: 'v2' },
    });

    expect(await wrappedModel.supportedUrls).toStrictEqual(model.value);
    expect(supportedUrlsCalled).toBe(true);
  });

  describe('wrapLanguageModel with multiple middlewares', () => {
    it('should call multiple transformParams middlewares in sequence for doGenerate', async () => {
      const mockModel = new MockLanguageModelV2({
        doGenerate: [],
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
            middlewareVersion: 'v2',
            transformParams: transformParams1,
          },
          {
            middlewareVersion: 'v2',
            transformParams: transformParams2,
          },
        ],
      });

      const params: LanguageModelV2CallOptions = {
        prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
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

      expect(mockModel.doGenerateCalls[0]).toStrictEqual(
        expect.objectContaining({
          transformationStep1: true,
          transformationStep2: true,
        }),
      );
    });

    it('should call multiple transformParams middlewares in sequence for doStream', async () => {
      const mockModel = new MockLanguageModelV2({
        doStream: [],
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
            middlewareVersion: 'v2',
            transformParams: transformParams1,
          },
          {
            middlewareVersion: 'v2',
            transformParams: transformParams2,
          },
        ],
      });

      const params: LanguageModelV2CallOptions = {
        prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
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
      expect(mockModel.doStreamCalls[0]).toStrictEqual(
        expect.objectContaining({
          transformationStep1: true,
          transformationStep2: true,
        }),
      );
    });

    it('should chain multiple wrapGenerate middlewares in the correct order', async () => {
      const mockModel = new MockLanguageModelV2({
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
            middlewareVersion: 'v2',
            wrapGenerate: wrapGenerate1,
          },
          {
            middlewareVersion: 'v2',
            wrapGenerate: wrapGenerate2,
          },
        ],
      });

      const params: LanguageModelV2CallOptions = {
        prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
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
      const mockModel = new MockLanguageModelV2({
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
            middlewareVersion: 'v2',
            wrapStream: wrapStream1,
          },
          {
            middlewareVersion: 'v2',
            wrapStream: wrapStream2,
          },
        ],
      });

      const params: LanguageModelV2CallOptions = {
        prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
      };

      const result = await wrappedModel.doStream(params);

      // The middlewares should wrap in order, applying wrapStream2 last
      expect(result).toBe('wrapStream1(wrapStream2(final stream result))');
      expect(wrapStream1).toHaveBeenCalled();
      expect(wrapStream2).toHaveBeenCalled();
    });
  });
});
