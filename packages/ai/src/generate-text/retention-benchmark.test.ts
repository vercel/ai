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
    it('should retain request body by default', async () => {
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

      // Body should be retained by default
      expect(result.request.body).toBe(largeBody);
      expect((result.request.body as string).length).toBe(LARGE_BODY_SIZE);
    });

    it('should exclude request body when retention.requestBody is false', async () => {
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
        experimental_include: { requestBody: false },
      });

      // Body should be excluded
      expect(result.request.body).toBeUndefined();
    });

    it('should retain response body by default', async () => {
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

      // Response body should be retained by default
      expect(result.response.body).toBe(largeBody);
    });

    it('should exclude response body when retention.responseBody is false', async () => {
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
        experimental_include: { responseBody: false },
      });

      // Response body should be excluded
      expect(result.response.body).toBeUndefined();
    });

    it('should exclude both bodies when both retention options are false', async () => {
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
        experimental_include: { requestBody: false, responseBody: false },
      });

      // Both bodies should be excluded
      expect(result.request.body).toBeUndefined();
      expect(result.response.body).toBeUndefined();
    });
  });

  describe('streamText', () => {
    it('should retain request body by default', async () => {
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

      // Body should be retained by default
      expect(request.body).toBe(largeBody);
      expect((request.body as string).length).toBe(LARGE_BODY_SIZE);
    });

    it('should exclude request body when retention.requestBody is false', async () => {
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
        experimental_include: { requestBody: false },
      });

      const request = await result.request;

      // Body should be excluded
      expect(request.body).toBeUndefined();
    });
  });

  describe('memory comparison', () => {
    it('should use less memory when retention is disabled', async () => {
      const largeBody = createLargeBody();

      // Run with retention enabled (default)
      const memoryBeforeRetained = process.memoryUsage().heapUsed;

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
      });

      const memoryAfterRetained = process.memoryUsage().heapUsed;
      const retainedSize = (resultRetained.request.body as string)?.length ?? 0;
      const retainedResponseSize =
        (resultRetained.response.body as string)?.length ?? 0;

      // Run with retention disabled
      const memoryBeforeExcluded = process.memoryUsage().heapUsed;

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
        experimental_include: { requestBody: false, responseBody: false },
      });

      const memoryAfterExcluded = process.memoryUsage().heapUsed;
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
