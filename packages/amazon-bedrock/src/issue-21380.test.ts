import type { LanguageModelV3Prompt } from '@ai-sdk/provider';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BedrockChatLanguageModel } from './bedrock-chat-language-model';

const prompt: LanguageModelV3Prompt = [
  {
    role: 'user',
    content: [{ type: 'text', text: 'Say OK' }],
  },
];

const successResponse = fs.readFileSync(
  'src/__fixtures__/amazon-bedrock-opus-5-top-k-success.json',
  'utf8',
);

const errorResponses = {
  temperature: fs.readFileSync(
    'src/__fixtures__/amazon-bedrock-opus-5-deprecated-sampling-parameter.json',
    'utf8',
  ),
  topP: fs.readFileSync(
    'src/__fixtures__/amazon-bedrock-opus-5-deprecated-top-p.json',
    'utf8',
  ),
};

describe('issue #21380', () => {
  it.each([
    {
      feature: 'temperature' as const,
      callOptions: { temperature: 0 },
      errorResponse: errorResponses.temperature,
    },
    {
      feature: 'topP' as const,
      callOptions: { topP: 0.9 },
      errorResponse: errorResponses.topP,
    },
    {
      feature: 'topK' as const,
      callOptions: { topK: 10 },
      errorResponse: undefined,
    },
  ])(
    'omits $feature and warns for Claude Opus 5',
    async ({ feature, callOptions, errorResponse }) => {
      let requestBody:
        | {
            inferenceConfig?: Record<string, unknown>;
          }
        | undefined;

      const model = new BedrockChatLanguageModel(
        'global.anthropic.claude-opus-5',
        {
          baseUrl: () => 'https://bedrock-runtime.us-east-1.amazonaws.com',
          headers: {},
          generateId: () => 'test-id',
          fetch: async (_input, init) => {
            requestBody = JSON.parse(String(init?.body));
            const parameterWasForwarded =
              requestBody?.inferenceConfig?.[feature] != null;

            return new Response(
              parameterWasForwarded && errorResponse != null
                ? errorResponse
                : successResponse,
              {
                status:
                  parameterWasForwarded && errorResponse != null ? 400 : 200,
                headers: { 'content-type': 'application/json' },
              },
            );
          },
        },
      );

      const result = await model.doGenerate({
        prompt,
        maxOutputTokens: 16,
        ...callOptions,
      });

      expect(requestBody?.inferenceConfig).not.toHaveProperty(feature);
      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          type: 'unsupported',
          feature,
        }),
      );
    },
  );

  it('removes additionalModelRequestFields.top_k for Claude Opus 5', async () => {
    let requestBody:
      | {
          additionalModelRequestFields?: Record<string, unknown>;
        }
      | undefined;

    const model = new BedrockChatLanguageModel(
      'global.anthropic.claude-opus-5',
      {
        baseUrl: () => 'https://bedrock-runtime.us-east-1.amazonaws.com',
        headers: {},
        generateId: () => 'test-id',
        fetch: async (_input, init) => {
          requestBody = JSON.parse(String(init?.body));
          return new Response(successResponse, {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        },
      },
    );

    const result = await model.doGenerate({
      prompt,
      providerOptions: {
        bedrock: {
          additionalModelRequestFields: {
            top_k: 10,
          },
        },
      },
    });

    expect(requestBody?.additionalModelRequestFields).not.toHaveProperty(
      'top_k',
    );
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        type: 'unsupported',
        feature: 'topK',
      }),
    );
  });
});
