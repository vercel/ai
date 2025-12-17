import {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3Middleware,
} from '@ai-sdk/provider';
import { wrapLanguageModel } from '../middleware/wrap-language-model';
import { MockLanguageModelV3 } from '../test/mock-language-model-v3';
import { describe, it, expect, vi } from 'vitest';

describe('wrapLanguageModel', () => {
  describe('model property', () => {
    it('should pass through by default', () => {
      const wrappedModel = wrapLanguageModel({
        model: new MockLanguageModelV3({
          modelId: 'test-model',
        }),
        middleware: {
          specificationVersion: 'v3',
        },
      });

      expect(wrappedModel.modelId).toBe('test-model');
    });

    it('should use middleware overrideModelId if provided', () => {
      const wrappedModel = wrapLanguageModel({
        model: new MockLanguageModelV3({
          modelId: 'test-model',
        }),
        middleware: {
          specificationVersion: 'v3',
          overrideModelId: ({ model }) => 'override-model',
        },
      });

      expect(wrappedModel.modelId).toBe('override-model');
    });

    it('should use modelId parameter if provided', () => {
      const wrappedModel = wrapLanguageModel({
        model: new MockLanguageModelV3({
          modelId: 'test-model',
        }),
        middleware: {
          specificationVersion: 'v3',
        },
        modelId: 'override-model',
      });

      expect(wrappedModel.modelId).toBe('override-model');
    });
  });

  describe('provider property', () => {
    it('should pass through by default', () => {
      const wrappedModel = wrapLanguageModel({
        model: new MockLanguageModelV3({
          provider: 'test-provider',
        }),
        middleware: {
          specificationVersion: 'v3',
        },
      });

      expect(wrappedModel.provider).toBe('test-provider');
    });

    it('should use middleware overrideProvider if provided', () => {
      const wrappedModel = wrapLanguageModel({
        model: new MockLanguageModelV3({
          provider: 'test-provider',
        }),
        middleware: {
          specificationVersion: 'v3',
          overrideProvider: ({ model }) => 'override-provider',
        },
      });

      expect(wrappedModel.provider).toBe('override-provider');
    });

    it('should use providerId parameter if provided', () => {
      const wrappedModel = wrapLanguageModel({
        model: new MockLanguageModelV3({
          provider: 'test-provider',
        }),
        middleware: {
          specificationVersion: 'v3',
        },
        providerId: 'override-provider',
      });

      expect(wrappedModel.provider).toBe('override-provider');
    });
  });

  describe('supportedUrls property', () => {
    it('should pass through by default', async () => {
      const supportedUrls = {
        'original/*': [/^https:\/\/.*$/],
      };

      const wrappedModel = wrapLanguageModel({
        model: new MockLanguageModelV3({ supportedUrls }),
        middleware: {
          specificationVersion: 'v3',
        },
      });

      expect(await wrappedModel.supportedUrls).toStrictEqual(supportedUrls);
    });

    it('should use middleware overrideSupportedUrls if provided', () => {
      const wrappedModel = wrapLanguageModel({
        model: new MockLanguageModelV3({
          supportedUrls: {
            'original/*': [/^https:\/\/.*$/],
          },
        }),
        middleware: {
          specificationVersion: 'v3',
          overrideSupportedUrls: ({ model }) => ({
            'override/*': [/^https:\/\/.*$/],
          }),
        },
      });

      expect(wrappedModel.supportedUrls).toStrictEqual({
        'override/*': [/^https:\/\/.*$/],
      });
    });
  });

  it('should call transformParams middleware for doGenerate', async () => {
    const mockModel = new MockLanguageModelV3({
      doGenerate: [],
    });
    const transformParams = vi.fn().mockImplementation(({ params }) => ({
      ...params,
      transformed: true,
    }));

    const wrappedModel = wrapLanguageModel({
      model: mockModel,
      middleware: {
        specificationVersion: 'v3',
        transformParams,
      },
    });

    const params: LanguageModelV3CallOptions = {
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
    };

    await wrappedModel.doGenerate(params);

    expect(transformParams).toHaveBeenCalledWith({
      params,
      type: 'generate',
      model: expect.any(Object),
    });

    expect(mockModel.doGenerateCalls[0]).toStrictEqual({
      ...params,
      transformed: true,
    });
  });

  it('should call wrapGenerate middleware', async () => {
    const mockModel = new MockLanguageModelV3({
      doGenerate: vi.fn().mockResolvedValue('mock result'),
    });
    const wrapGenerate = vi
      .fn()
      .mockImplementation(({ doGenerate }) => doGenerate());

    const wrappedModel = wrapLanguageModel({
      model: mockModel,
      middleware: {
        specificationVersion: 'v3',
        wrapGenerate,
      },
    });

    const params: LanguageModelV3CallOptions = {
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
    const mockModel = new MockLanguageModelV3({
      doStream: [],
    });

    const transformParams = vi.fn().mockImplementation(({ params }) => ({
      ...params,
      transformed: true,
    }));

    const wrappedModel = wrapLanguageModel({
      model: mockModel,
      middleware: {
        specificationVersion: 'v3',
        transformParams,
      },
    });

    const params: LanguageModelV3CallOptions = {
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
    };

    await wrappedModel.doStream(params);

    expect(transformParams).toHaveBeenCalledWith({
      params,
      type: 'stream',
      model: expect.any(Object),
    });
    expect(mockModel.doStreamCalls[0]).toStrictEqual({
      ...params,
      transformed: true,
    });
  });

  it('should call wrapStream middleware', async () => {
    const mockModel = new MockLanguageModelV3({
      doStream: vi.fn().mockResolvedValue('mock stream'),
    });
    const wrapStream = vi.fn().mockImplementation(({ doStream }) => doStream());

    const wrappedModel = wrapLanguageModel({
      model: mockModel,
      middleware: {
        specificationVersion: 'v3',
        wrapStream,
      },
    });

    const params: LanguageModelV3CallOptions = {
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

  it('should support models that use "this" context in supportedUrls', async () => {
    let supportedUrlsCalled = false;

    class MockLanguageModelWithImageSupport implements LanguageModelV3 {
      readonly specificationVersion = 'v3';
      readonly provider = 'test-provider';
      readonly modelId = 'test-model';

      readonly doGenerate: LanguageModelV3['doGenerate'] = vi.fn();
      readonly doStream: LanguageModelV3['doStream'] = vi.fn();

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
      middleware: { specificationVersion: 'v3' },
    });

    expect(await wrappedModel.supportedUrls).toStrictEqual(model.value);
    expect(supportedUrlsCalled).toBe(true);
  });

  describe('multiple middlewares', () => {
    it('should call multiple transformParams middlewares in sequence for doGenerate', async () => {
      const mockModel = new MockLanguageModelV3({
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
            specificationVersion: 'v3',
            transformParams: transformParams1,
          },
          {
            specificationVersion: 'v3',
            transformParams: transformParams2,
          },
        ],
      });

      const params: LanguageModelV3CallOptions = {
        prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
      };

      await wrappedModel.doGenerate(params);

      expect(transformParams1).toHaveBeenCalledWith({
        params,
        type: 'generate',
        model: expect.any(Object),
      });

      expect(transformParams2).toHaveBeenCalledWith({
        params: { ...params, transformationStep1: true },
        type: 'generate',
        model: expect.any(Object),
      });

      expect(mockModel.doGenerateCalls[0]).toStrictEqual(
        expect.objectContaining({
          transformationStep1: true,
          transformationStep2: true,
        }),
      );
    });

    it('should call multiple transformParams middlewares in sequence for doStream', async () => {
      const mockModel = new MockLanguageModelV3({
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
            specificationVersion: 'v3',
            transformParams: transformParams1,
          },
          {
            specificationVersion: 'v3',
            transformParams: transformParams2,
          },
        ],
      });

      const params: LanguageModelV3CallOptions = {
        prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
      };

      await wrappedModel.doStream(params);

      expect(transformParams1).toHaveBeenCalledWith({
        params,
        type: 'stream',
        model: expect.any(Object),
      });
      expect(transformParams2).toHaveBeenCalledWith({
        params: expect.objectContaining({ transformationStep1: true }),
        type: 'stream',
        model: mockModel,
      });
      expect(mockModel.doStreamCalls[0]).toStrictEqual(
        expect.objectContaining({
          transformationStep1: true,
          transformationStep2: true,
        }),
      );
    });

    it('should chain multiple wrapGenerate middlewares in the correct order', async () => {
      const mockModel = new MockLanguageModelV3({
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
            specificationVersion: 'v3',
            wrapGenerate: wrapGenerate1,
          },
          {
            specificationVersion: 'v3',
            wrapGenerate: wrapGenerate2,
          },
        ],
      });

      const params: LanguageModelV3CallOptions = {
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
      const mockModel = new MockLanguageModelV3({
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
            specificationVersion: 'v3',
            wrapStream: wrapStream1,
          },
          {
            specificationVersion: 'v3',
            wrapStream: wrapStream2,
          },
        ],
      });

      const params: LanguageModelV3CallOptions = {
        prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
      };

      const result = await wrappedModel.doStream(params);

      // The middlewares should wrap in order, applying wrapStream2 last
      expect(result).toBe('wrapStream1(wrapStream2(final stream result))');
      expect(wrapStream1).toHaveBeenCalled();
      expect(wrapStream2).toHaveBeenCalled();
    });

    it('should not mutate the middleware array argument', async () => {
      const middleware1 = {
        specificationVersion: 'v3',
        wrapStream: vi.fn(),
      };

      const middleware2 = {
        specificationVersion: 'v3',
        wrapStream: vi.fn(),
      };

      const middlewares = [
        middleware1,
        middleware2,
      ] as LanguageModelV3Middleware[];

      wrapLanguageModel({
        model: new MockLanguageModelV3(),
        middleware: middlewares,
      });

      expect(middlewares.length).toBe(2);
      expect(middlewares[0]).toBe(middleware1);
      expect(middlewares[1]).toBe(middleware2);
    });
  });
});
