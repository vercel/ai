import type {
  LanguageModelV4CallOptions,
  LanguageModelV4StreamResult,
} from '@ai-sdk/provider';
import { describe, expect, it, vi } from 'vitest';
import { MockLanguageModelV4 } from '../test/mock-language-model-v4';
import { createFallbackLanguageModel } from './create-fallback-language-model';

const fakeCall: LanguageModelV4CallOptions = {
  prompt: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
} as unknown as LanguageModelV4CallOptions;

function ok(text = 'hello') {
  return {
    content: [{ type: 'text' as const, text }],
    finishReason: 'stop' as const,
    usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    warnings: [],
  };
}

function streamOk(): LanguageModelV4StreamResult {
  return {
    stream: new ReadableStream({
      start(controller) {
        controller.enqueue({ type: 'text-start', id: '0' });
        controller.enqueue({ type: 'text-delta', id: '0', delta: 'hi' });
        controller.enqueue({ type: 'text-end', id: '0' });
        controller.enqueue({
          type: 'finish',
          finishReason: 'stop',
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        });
        controller.close();
      },
    }),
    request: {},
    response: { headers: {} },
  } as unknown as LanguageModelV4StreamResult;
}

describe('createFallbackLanguageModel', () => {
  describe('configuration', () => {
    it('throws when no models are provided', () => {
      expect(() => createFallbackLanguageModel({ models: [] })).toThrow(
        /at least one model/,
      );
    });

    it('uses default provider / model id derived from the chain', () => {
      const m = createFallbackLanguageModel({
        models: [
          new MockLanguageModelV4({ provider: 'p1', modelId: 'm1' }),
          new MockLanguageModelV4({ provider: 'p2', modelId: 'm2' }),
        ],
      });
      expect(m.provider).toBe('fallback');
      expect(m.modelId).toBe('fallback(p1:m1,p2:m2)');
    });

    it('respects modelId / providerId overrides', () => {
      const m = createFallbackLanguageModel({
        models: [new MockLanguageModelV4({})],
        modelId: 'custom',
        providerId: 'mine',
      });
      expect(m.provider).toBe('mine');
      expect(m.modelId).toBe('custom');
    });
  });

  describe('doGenerate', () => {
    it('returns the first model result when it succeeds', async () => {
      const primary = new MockLanguageModelV4({ doGenerate: ok('primary') });
      const secondary = new MockLanguageModelV4({
        doGenerate: async () => {
          throw new Error('should not be called');
        },
      });
      const fb = createFallbackLanguageModel({
        models: [primary, secondary],
      });

      const r = await fb.doGenerate(fakeCall);
      expect((r.content[0] as any).text).toBe('primary');
      expect(primary.doGenerateCalls).toHaveLength(1);
      expect(secondary.doGenerateCalls).toHaveLength(0);
    });

    it('falls through to the next model on error', async () => {
      const primary = new MockLanguageModelV4({
        doGenerate: async () => {
          throw new Error('boom');
        },
      });
      const secondary = new MockLanguageModelV4({
        doGenerate: ok('secondary'),
      });

      const fb = createFallbackLanguageModel({
        models: [primary, secondary],
      });

      const r = await fb.doGenerate(fakeCall);
      expect((r.content[0] as any).text).toBe('secondary');
      expect(primary.doGenerateCalls).toHaveLength(1);
      expect(secondary.doGenerateCalls).toHaveLength(1);
    });

    it('re-throws the last error when all models fail', async () => {
      const m1 = new MockLanguageModelV4({
        doGenerate: async () => {
          throw new Error('err-1');
        },
      });
      const m2 = new MockLanguageModelV4({
        doGenerate: async () => {
          throw new Error('err-2');
        },
      });
      const fb = createFallbackLanguageModel({ models: [m1, m2] });

      await expect(fb.doGenerate(fakeCall)).rejects.toThrow('err-2');
    });

    it('honors shouldRetry returning false (rethrows immediately)', async () => {
      const m1 = new MockLanguageModelV4({
        doGenerate: async () => {
          throw new Error('auth');
        },
      });
      const m2 = new MockLanguageModelV4({ doGenerate: ok('secondary') });
      const fb = createFallbackLanguageModel({
        models: [m1, m2],
        shouldRetry: () => false,
      });

      await expect(fb.doGenerate(fakeCall)).rejects.toThrow('auth');
      expect(m2.doGenerateCalls).toHaveLength(0);
    });

    it('passes the model index to shouldRetry', async () => {
      const seen: number[] = [];
      const m1 = new MockLanguageModelV4({
        doGenerate: async () => {
          throw new Error('a');
        },
      });
      const m2 = new MockLanguageModelV4({
        doGenerate: async () => {
          throw new Error('b');
        },
      });
      const m3 = new MockLanguageModelV4({ doGenerate: ok('c') });
      const fb = createFallbackLanguageModel({
        models: [m1, m2, m3],
        shouldRetry: (_e, index) => {
          seen.push(index);
          return true;
        },
      });

      await fb.doGenerate(fakeCall);
      expect(seen).toEqual([0, 1]);
    });
  });

  describe('doStream', () => {
    it('returns the first stream that opens without throwing', async () => {
      const primary = new MockLanguageModelV4({ doStream: streamOk() });
      const secondary = new MockLanguageModelV4({
        doStream: async () => {
          throw new Error('should not be called');
        },
      });
      const fb = createFallbackLanguageModel({
        models: [primary, secondary],
      });

      const r = await fb.doStream(fakeCall);
      expect(r.stream).toBeInstanceOf(ReadableStream);
      expect(secondary.doStreamCalls).toHaveLength(0);
    });

    it('falls through to the next model when doStream rejects', async () => {
      const primary = new MockLanguageModelV4({
        doStream: async () => {
          throw new Error('preflight');
        },
      });
      const secondary = new MockLanguageModelV4({ doStream: streamOk() });
      const fb = createFallbackLanguageModel({
        models: [primary, secondary],
      });

      const r = await fb.doStream(fakeCall);
      expect(r.stream).toBeInstanceOf(ReadableStream);
      expect(primary.doStreamCalls).toHaveLength(1);
      expect(secondary.doStreamCalls).toHaveLength(1);
    });

    it('re-throws the last error when all streams fail to open', async () => {
      const m1 = new MockLanguageModelV4({
        doStream: async () => {
          throw new Error('a');
        },
      });
      const m2 = new MockLanguageModelV4({
        doStream: async () => {
          throw new Error('b');
        },
      });
      const fb = createFallbackLanguageModel({ models: [m1, m2] });
      await expect(fb.doStream(fakeCall)).rejects.toThrow('b');
    });

    it('respects shouldRetry on stream failures', async () => {
      const m1 = new MockLanguageModelV4({
        doStream: async () => {
          throw new Error('skip-me');
        },
      });
      const m2 = new MockLanguageModelV4({ doStream: streamOk() });
      const shouldRetry = vi.fn().mockReturnValue(false);
      const fb = createFallbackLanguageModel({
        models: [m1, m2],
        shouldRetry,
      });

      await expect(fb.doStream(fakeCall)).rejects.toThrow('skip-me');
      expect(shouldRetry).toHaveBeenCalledOnce();
      expect(m2.doStreamCalls).toHaveLength(0);
    });
  });

  describe('passthrough', () => {
    it('inherits supportedUrls from the first model', () => {
      const supportedUrls = { 'image/*': [/^https:\/\/example.com\/.*$/] };
      const primary = new MockLanguageModelV4({
        supportedUrls: () => supportedUrls,
      });
      const secondary = new MockLanguageModelV4({});
      const fb = createFallbackLanguageModel({
        models: [primary, secondary],
      });
      expect(fb.supportedUrls).toEqual(supportedUrls);
    });
  });
});
