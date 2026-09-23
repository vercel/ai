import type { LanguageModelV4CallOptions } from '@ai-sdk/provider';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AmazonBedrockChatLanguageModel } from './amazon-bedrock-chat-language-model';

const TEST_PROMPT: LanguageModelV4CallOptions['prompt'] = [
  { role: 'user', content: [{ type: 'text', text: 'Say OK' }] },
];

const samplingCases = [
  {
    feature: 'temperature',
    fixture: 'amazon-bedrock-opus-5-deprecated-sampling-parameter.json',
    options: { temperature: 0 },
  },
  {
    feature: 'topP',
    fixture: 'amazon-bedrock-opus-5-deprecated-top-p.json',
    options: { topP: 0.9 },
  },
] as const;

describe('issue #21380', () => {
  it.each(samplingCases)(
    'omits $feature for Claude Opus 5 and returns an unsupported warning',
    async ({ feature, fixture, options }) => {
      const liveErrorFixture = JSON.parse(
        fs.readFileSync(`src/__fixtures__/${fixture}`, 'utf8'),
      );
      const model = new AmazonBedrockChatLanguageModel(
        'global.anthropic.claude-opus-5',
        {
          baseUrl: () => 'https://bedrock-runtime.us-east-1.amazonaws.com',
          generateId: () => 'test-id',
          fetch: async (_input, init) => {
            const body = JSON.parse(String(init?.body));
            const samplingValue = body.inferenceConfig?.[feature];

            if (samplingValue != null) {
              return new Response(JSON.stringify(liveErrorFixture), {
                status: 400,
                headers: { 'content-type': 'application/json' },
              });
            }

            return new Response(
              JSON.stringify({
                output: {
                  message: {
                    role: 'assistant',
                    content: [{ text: 'OK' }],
                  },
                },
                stopReason: 'end_turn',
                usage: {
                  inputTokens: 2,
                  outputTokens: 1,
                  totalTokens: 3,
                },
              }),
              {
                status: 200,
                headers: { 'content-type': 'application/json' },
              },
            );
          },
        },
      );

      const result = await model.doGenerate({
        prompt: TEST_PROMPT,
        ...options,
      });

      expect(result.content).toContainEqual({ type: 'text', text: 'OK' });
      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          type: 'unsupported',
          feature,
        }),
      );
    },
  );
});
