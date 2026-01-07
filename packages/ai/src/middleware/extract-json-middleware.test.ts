import { LanguageModelV3Usage } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';
import { generateText } from '../generate-text';
import { wrapLanguageModel } from '../middleware/wrap-language-model';
import { MockLanguageModelV3 } from '../test/mock-language-model-v3';
import { extractJsonMiddleware } from './extract-json-middleware';

const testUsage: LanguageModelV3Usage = {
  inputTokens: {
    total: 5,
    noCache: 5,
    cacheRead: 0,
    cacheWrite: 0,
  },
  outputTokens: {
    total: 10,
    text: 10,
    reasoning: 0,
  },
};

describe('extractJsonMiddleware', () => {
  describe('wrapGenerate', () => {
    it('should strip markdown json fence from text content', async () => {
      const mockModel = new MockLanguageModelV3({
        async doGenerate() {
          return {
            content: [
              {
                type: 'text',
                text: '```json\n{"value": "test"}\n```',
              },
            ],
            finishReason: { unified: 'stop', raw: 'stop' },
            usage: testUsage,
            warnings: [],
          };
        },
      });

      const result = await generateText({
        model: wrapLanguageModel({
          model: mockModel,
          middleware: extractJsonMiddleware(),
        }),
        prompt: 'Generate JSON',
      });

      expect(result.text).toBe('{"value": "test"}');
    });

    it('should strip markdown fence without json tag', async () => {
      const mockModel = new MockLanguageModelV3({
        async doGenerate() {
          return {
            content: [
              {
                type: 'text',
                text: '```\n{"value": "test"}\n```',
              },
            ],
            finishReason: { unified: 'stop', raw: 'stop' },
            usage: testUsage,
            warnings: [],
          };
        },
      });

      const result = await generateText({
        model: wrapLanguageModel({
          model: mockModel,
          middleware: extractJsonMiddleware(),
        }),
        prompt: 'Generate JSON',
      });

      expect(result.text).toBe('{"value": "test"}');
    });

    it('should leave text without fences unchanged', async () => {
      const mockModel = new MockLanguageModelV3({
        async doGenerate() {
          return {
            content: [
              {
                type: 'text',
                text: '{"value": "test"}',
              },
            ],
            finishReason: { unified: 'stop', raw: 'stop' },
            usage: testUsage,
            warnings: [],
          };
        },
      });

      const result = await generateText({
        model: wrapLanguageModel({
          model: mockModel,
          middleware: extractJsonMiddleware(),
        }),
        prompt: 'Generate JSON',
      });

      expect(result.text).toBe('{"value": "test"}');
    });

    it('should use custom transform function when provided', async () => {
      const mockModel = new MockLanguageModelV3({
        async doGenerate() {
          return {
            content: [
              {
                type: 'text',
                text: 'PREFIX{"value": "test"}SUFFIX',
              },
            ],
            finishReason: { unified: 'stop', raw: 'stop' },
            usage: testUsage,
            warnings: [],
          };
        },
      });

      const result = await generateText({
        model: wrapLanguageModel({
          model: mockModel,
          middleware: extractJsonMiddleware({
            transform: text => text.replace('PREFIX', '').replace('SUFFIX', ''),
          }),
        }),
        prompt: 'Generate JSON',
      });

      expect(result.text).toBe('{"value": "test"}');
    });

    it('should preserve non-text content parts', async () => {
      const mockModel = new MockLanguageModelV3({
        async doGenerate() {
          return {
            content: [
              {
                type: 'text',
                text: '```json\n{"value": "test"}\n```',
              },
              {
                type: 'tool-call',
                toolCallId: 'call-1',
                toolName: 'testTool',
                input: '{"foo": "bar"}',
              },
            ],
            finishReason: { unified: 'stop', raw: 'stop' },
            usage: testUsage,
            warnings: [],
          };
        },
      });

      const result = await generateText({
        model: wrapLanguageModel({
          model: mockModel,
          middleware: extractJsonMiddleware(),
        }),
        prompt: 'Generate JSON',
      });

      expect(result.text).toBe('{"value": "test"}');
      expect(result.content).toHaveLength(3);
      expect(result.content[1]).toMatchObject({
        type: 'tool-call',
        toolCallId: 'call-1',
      });
    });
  });
});
