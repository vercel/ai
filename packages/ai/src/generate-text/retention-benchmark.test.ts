import { describe, expect, it } from 'vitest';
import { LanguageModelV3Usage } from '@ai-sdk/provider';
import { MockLanguageModelV3 } from '../test/mock-language-model-v3';
import { generateText } from './generate-text';
import { streamText } from './stream-text';
import { convertArrayToReadableStream } from '@ai-sdk/provider-utils/test';

const LARGE_BODY_SIZE = 1024 * 1024; // 1MB

function createLargeBody(): string {
  return 'x'.repeat(LARGE_BODY_SIZE);
}

const testUsage: LanguageModelV3Usage = {
  inputTokens: {
    total: 10,
    noCache: 10,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: {
    total: 20,
    text: 20,
    reasoning: undefined,
  },
};

const dummyResponseValues = {
  finishReason: { unified: 'stop' as const, raw: 'stop' },
  usage: testUsage,
  warnings: [],
};

describe('retention benchmark', () => {
  describe('generateText', () => {
    it('should exclude request body by default', async () => {
      const largeBody = createLargeBody();

      const result = await generateText({
        model: new MockLanguageModelV3({
          doGenerate: async () => ({
            ...dummyResponseValues,
            content: [{ type: 'text', text: 'Hello' }],
            request: { body: largeBody },
          }),
        }),
        prompt: 'test',
      });

      // Body should be excluded by default
      expect(result.request.body).toBeUndefined();
    });

    it('should retain request body when include.requestBody is true', async () => {
      const largeBody = createLargeBody();

      const result = await generateText({
        model: new MockLanguageModelV3({
          doGenerate: async () => ({
            ...dummyResponseValues,
            content: [{ type: 'text', text: 'Hello' }],
            request: { body: largeBody },
          }),
        }),
        prompt: 'test',
        include: { requestBody: true },
      });

      // Body should be retained
      expect(result.request.body).toBe(largeBody);
      expect((result.request.body as string).length).toBe(LARGE_BODY_SIZE);
    });

    it('should exclude response body by default', async () => {
      const largeBody = createLargeBody();

      const result = await generateText({
        model: new MockLanguageModelV3({
          doGenerate: async () => ({
            ...dummyResponseValues,
            content: [{ type: 'text', text: 'Hello' }],
            response: {
              id: 'test-id',
              timestamp: new Date(0),
              modelId: 'test-model',
              body: largeBody,
            },
          }),
        }),
        prompt: 'test',
      });

      // Response body should be excluded by default
      expect(result.response.body).toBeUndefined();
    });

    it('should retain response body when include.responseBody is true', async () => {
      const largeBody = createLargeBody();

      const result = await generateText({
        model: new MockLanguageModelV3({
          doGenerate: async () => ({
            ...dummyResponseValues,
            content: [{ type: 'text', text: 'Hello' }],
            response: {
              id: 'test-id',
              timestamp: new Date(0),
              modelId: 'test-model',
              body: largeBody,
            },
          }),
        }),
        prompt: 'test',
        include: { responseBody: true },
      });

      // Response body should be retained
      expect(result.response.body).toBe(largeBody);
    });

    it('should retain both bodies when both include options are true', async () => {
      const largeRequestBody = createLargeBody();
      const largeResponseBody = createLargeBody();

      const result = await generateText({
        model: new MockLanguageModelV3({
          doGenerate: async () => ({
            ...dummyResponseValues,
            content: [{ type: 'text', text: 'Hello' }],
            request: { body: largeRequestBody },
            response: {
              id: 'test-id',
              timestamp: new Date(0),
              modelId: 'test-model',
              body: largeResponseBody,
            },
          }),
        }),
        prompt: 'test',
        include: { requestBody: true, responseBody: true },
      });

      // Both bodies should be retained
      expect(result.request.body).toBe(largeRequestBody);
      expect(result.response.body).toBe(largeResponseBody);
    });
  });

  describe('streamText', () => {
    it('should exclude request body by default', async () => {
      const largeBody = createLargeBody();

      const result = streamText({
        model: new MockLanguageModelV3({
          doStream: async () => ({
            stream: convertArrayToReadableStream([
              {
                type: 'response-metadata',
                id: 'id-0',
                modelId: 'mock-model-id',
                timestamp: new Date(0),
              },
              { type: 'text-start', id: '1' },
              { type: 'text-delta', id: '1', delta: 'Hello' },
              { type: 'text-end', id: '1' },
              {
                type: 'finish',
                finishReason: { unified: 'stop', raw: 'stop' },
                usage: testUsage,
              },
            ]),
            request: { body: largeBody },
          }),
        }),
        prompt: 'test',
      });

      const request = await result.request;

      // Body should be excluded by default
      expect(request.body).toBeUndefined();
    });

    it('should retain request body when include.requestBody is true', async () => {
      const largeBody = createLargeBody();

      const result = streamText({
        model: new MockLanguageModelV3({
          doStream: async () => ({
            stream: convertArrayToReadableStream([
              {
                type: 'response-metadata',
                id: 'id-0',
                modelId: 'mock-model-id',
                timestamp: new Date(0),
              },
              { type: 'text-start', id: '1' },
              { type: 'text-delta', id: '1', delta: 'Hello' },
              { type: 'text-end', id: '1' },
              {
                type: 'finish',
                finishReason: { unified: 'stop', raw: 'stop' },
                usage: testUsage,
              },
            ]),
            request: { body: largeBody },
          }),
        }),
        prompt: 'test',
        include: { requestBody: true },
      });

      const request = await result.request;

      // Body should be retained
      expect(request.body).toBe(largeBody);
      expect((request.body as string).length).toBe(LARGE_BODY_SIZE);
    });
  });

  describe('memory comparison', () => {
    it('should use less memory when retention is disabled', async () => {
      const largeBody = createLargeBody();

      // Run with retention enabled (explicitly opted in)
      const resultRetained = await generateText({
        model: new MockLanguageModelV3({
          doGenerate: async () => ({
            ...dummyResponseValues,
            content: [{ type: 'text', text: 'Hello' }],
            request: { body: largeBody },
            response: {
              id: 'test-id',
              timestamp: new Date(0),
              modelId: 'test-model',
              body: largeBody,
            },
          }),
        }),
        prompt: 'test',
        include: { requestBody: true, responseBody: true },
      });

      const retainedSize = (resultRetained.request.body as string)?.length ?? 0;
      const retainedResponseSize =
        (resultRetained.response.body as string)?.length ?? 0;

      // Run with retention disabled (default)
      const resultExcluded = await generateText({
        model: new MockLanguageModelV3({
          doGenerate: async () => ({
            ...dummyResponseValues,
            content: [{ type: 'text', text: 'Hello' }],
            request: { body: largeBody },
            response: {
              id: 'test-id',
              timestamp: new Date(0),
              modelId: 'test-model',
              body: largeBody,
            },
          }),
        }),
        prompt: 'test',
      });

      const excludedSize = (resultExcluded.request.body as string)?.length ?? 0;
      const excludedResponseSize =
        (resultExcluded.response.body as string)?.length ?? 0;

      // Verify retention behavior
      expect(retainedSize).toBe(LARGE_BODY_SIZE);
      expect(retainedResponseSize).toBe(LARGE_BODY_SIZE);
      expect(excludedSize).toBe(0);
      expect(excludedResponseSize).toBe(0);

      // The retained result should hold references to the large bodies
      // while the excluded result should not
      // Note: Memory comparison is not deterministic due to GC,
      // so we just verify the bodies are correctly included/excluded
    });
  });
});
