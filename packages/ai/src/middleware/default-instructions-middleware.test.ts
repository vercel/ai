import type {
  LanguageModelV4CallOptions,
  LanguageModelV4Middleware,
  LanguageModelV4Prompt,
} from '@ai-sdk/provider';
import { tool } from '@ai-sdk/provider-utils';
import { describe, expect, it } from 'vitest';
import { z } from 'zod/v4';
import { generateText } from '../generate-text/generate-text';
import { isStepCount } from '../generate-text/stop-condition';
import { MockLanguageModelV4 } from '../test/mock-language-model-v4';
import { defaultInstructionsMiddleware } from './default-instructions-middleware';
import { wrapLanguageModel } from './wrap-language-model';

const BASE_PARAMS: LanguageModelV4CallOptions = {
  prompt: [
    { role: 'user', content: [{ type: 'text', text: 'Hello, world!' }] },
  ],
};

const MOCK_MODEL = new MockLanguageModelV4();

const DUMMY_USAGE = {
  inputTokens: {
    total: 1,
    noCache: 1,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: {
    total: 1,
    text: 1,
    reasoning: undefined,
  },
};

describe('defaultInstructionsMiddleware', () => {
  describe('transformParams', () => {
    it('should prepend string instructions when the prompt has no system message', async () => {
      const middleware = defaultInstructionsMiddleware({
        instructions: 'You are a helpful assistant.',
      });

      const result = await middleware.transformParams!({
        type: 'generate',
        params: BASE_PARAMS,
        model: MOCK_MODEL,
      });

      expect(result).toEqual({
        prompt: [
          { role: 'system', content: 'You are a helpful assistant.' },
          ...BASE_PARAMS.prompt,
        ],
      });
    });

    it('should preserve provider options on default instructions', async () => {
      const middleware = defaultInstructionsMiddleware({
        instructions: {
          role: 'system',
          content: 'You are a helpful assistant.',
          providerOptions: {
            anthropic: {
              cacheControl: { type: 'ephemeral' },
            },
          },
        },
      });

      const result = await middleware.transformParams!({
        type: 'generate',
        params: BASE_PARAMS,
        model: MOCK_MODEL,
      });

      expect(result.prompt[0]).toEqual({
        role: 'system',
        content: 'You are a helpful assistant.',
        providerOptions: {
          anthropic: {
            cacheControl: { type: 'ephemeral' },
          },
        },
      });
    });

    it('should prepend multiple default instruction messages in order', async () => {
      const middleware = defaultInstructionsMiddleware({
        instructions: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'system', content: 'Answer concisely.' },
        ],
      });

      const result = await middleware.transformParams!({
        type: 'generate',
        params: BASE_PARAMS,
        model: MOCK_MODEL,
      });

      expect(result.prompt).toEqual([
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'system', content: 'Answer concisely.' },
        ...BASE_PARAMS.prompt,
      ]);
    });

    it('should let call-level instructions take precedence', async () => {
      const middleware = defaultInstructionsMiddleware({
        instructions: 'Default instructions',
      });
      const params: LanguageModelV4CallOptions = {
        ...BASE_PARAMS,
        prompt: [
          {
            role: 'system',
            content: 'Call-level instructions',
            providerOptions: { openai: { promptCacheKey: 'call-level' } },
          },
          ...BASE_PARAMS.prompt,
        ],
      };

      const result = await middleware.transformParams!({
        type: 'generate',
        params,
        model: MOCK_MODEL,
      });

      expect(result).toBe(params);
      expect(result.prompt).toEqual(params.prompt);
    });

    it('should not add defaults when a system message appears later in the prompt', async () => {
      const middleware = defaultInstructionsMiddleware({
        instructions: 'Default instructions',
      });
      const params: LanguageModelV4CallOptions = {
        prompt: [
          ...BASE_PARAMS.prompt,
          { role: 'system', content: 'Trusted conversation instructions' },
        ],
      };

      const result = await middleware.transformParams!({
        type: 'generate',
        params,
        model: MOCK_MODEL,
      });

      expect(result).toBe(params);
    });

    it('should preserve other call parameters', async () => {
      const middleware = defaultInstructionsMiddleware({
        instructions: 'Default instructions',
      });
      const params: LanguageModelV4CallOptions = {
        ...BASE_PARAMS,
        temperature: 0.5,
        providerOptions: {
          openai: {
            store: false,
          },
        },
      };

      const result = await middleware.transformParams!({
        type: 'generate',
        params,
        model: MOCK_MODEL,
      });

      expect(result).toEqual({
        ...params,
        prompt: [
          { role: 'system', content: 'Default instructions' },
          ...params.prompt,
        ],
      });
    });

    it('should leave the parameters unchanged for an empty instructions array', async () => {
      const middleware = defaultInstructionsMiddleware({
        instructions: [],
      });

      const result = await middleware.transformParams!({
        type: 'generate',
        params: BASE_PARAMS,
        model: MOCK_MODEL,
      });

      expect(result).toBe(BASE_PARAMS);
    });
  });

  describe('wrapped model', () => {
    it('should apply defaults to generate and stream calls without mutating the input', async () => {
      const model = new MockLanguageModelV4({
        doGenerate: [],
        doStream: [],
      });
      const wrappedModel = wrapLanguageModel({
        model,
        middleware: defaultInstructionsMiddleware({
          instructions: 'Default instructions',
        }),
      });

      await wrappedModel.doGenerate(BASE_PARAMS);
      await wrappedModel.doStream(BASE_PARAMS);

      const expectedPrompt = [
        { role: 'system', content: 'Default instructions' },
        ...BASE_PARAMS.prompt,
      ];

      expect(model.doGenerateCalls[0].prompt).toEqual(expectedPrompt);
      expect(model.doStreamCalls[0].prompt).toEqual(expectedPrompt);
      expect(BASE_PARAMS.prompt).toEqual([
        {
          role: 'user',
          content: [{ type: 'text', text: 'Hello, world!' }],
        },
      ]);
    });

    it('should respect system messages added by an earlier middleware', async () => {
      const model = new MockLanguageModelV4({
        doGenerate: [],
      });
      const addInstructionsMiddleware: LanguageModelV4Middleware = {
        specificationVersion: 'v4',
        transformParams: async ({ params }) => ({
          ...params,
          prompt: [
            { role: 'system', content: 'Earlier middleware instructions' },
            ...params.prompt,
          ],
        }),
      };
      const wrappedModel = wrapLanguageModel({
        model,
        middleware: [
          addInstructionsMiddleware,
          defaultInstructionsMiddleware({
            instructions: 'Default instructions',
          }),
        ],
      });

      await wrappedModel.doGenerate(BASE_PARAMS);

      expect(model.doGenerateCalls[0].prompt).toEqual([
        { role: 'system', content: 'Earlier middleware instructions' },
        ...BASE_PARAMS.prompt,
      ]);
    });

    it('should apply defaults once on repeated calls', async () => {
      const model = new MockLanguageModelV4({
        doGenerate: [],
      });
      const wrappedModel = wrapLanguageModel({
        model,
        middleware: defaultInstructionsMiddleware({
          instructions: 'Default instructions',
        }),
      });

      await wrappedModel.doGenerate(BASE_PARAMS);
      await wrappedModel.doGenerate(BASE_PARAMS);

      expect(model.doGenerateCalls).toHaveLength(2);
      for (const call of model.doGenerateCalls) {
        expect(call.prompt).toEqual([
          { role: 'system', content: 'Default instructions' },
          ...BASE_PARAMS.prompt,
        ]);
      }
    });

    it('should apply defaults once to every step of a multi-step generation', async () => {
      const prompts: LanguageModelV4Prompt[] = [];
      let callCount = 0;
      const model = new MockLanguageModelV4({
        doGenerate: async ({ prompt }) => {
          prompts.push(prompt);

          if (callCount++ === 0) {
            return {
              content: [
                {
                  type: 'tool-call',
                  toolCallType: 'function',
                  toolCallId: 'call-1',
                  toolName: 'weather',
                  input: '{}',
                },
              ],
              finishReason: { unified: 'tool-calls', raw: undefined },
              usage: DUMMY_USAGE,
              warnings: [],
            };
          }

          return {
            content: [{ type: 'text', text: 'Done.' }],
            finishReason: { unified: 'stop', raw: undefined },
            usage: DUMMY_USAGE,
            warnings: [],
          };
        },
      });

      await generateText({
        model: wrapLanguageModel({
          model,
          middleware: defaultInstructionsMiddleware({
            instructions: 'Default instructions',
          }),
        }),
        tools: {
          weather: tool({
            inputSchema: z.object({}),
            execute: async () => 'sunny',
          }),
        },
        prompt: 'What is the weather?',
        stopWhen: isStepCount(2),
      });

      expect(prompts).toHaveLength(2);
      for (const prompt of prompts) {
        expect(
          prompt.filter(message => message.role === 'system'),
        ).toStrictEqual([{ role: 'system', content: 'Default instructions' }]);
      }
    });

    it('should let trusted system messages in message histories override defaults', async () => {
      const model = new MockLanguageModelV4({
        doGenerate: {
          content: [{ type: 'text', text: 'Done.' }],
          finishReason: { unified: 'stop', raw: undefined },
          usage: DUMMY_USAGE,
          warnings: [],
        },
      });

      await generateText({
        model: wrapLanguageModel({
          model,
          middleware: defaultInstructionsMiddleware({
            instructions: 'Default instructions',
          }),
        }),
        messages: [
          { role: 'system', content: 'Conversation instructions' },
          { role: 'user', content: 'Hello' },
        ],
        allowSystemInMessages: true,
      });

      expect(model.doGenerateCalls[0].prompt).toEqual([
        { role: 'system', content: 'Conversation instructions' },
        {
          role: 'user',
          content: [{ type: 'text', text: 'Hello' }],
          providerOptions: undefined,
        },
      ]);
    });
  });
});
