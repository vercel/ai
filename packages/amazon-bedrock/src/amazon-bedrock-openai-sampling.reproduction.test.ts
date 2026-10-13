import type {
  LanguageModelV3CallOptions,
  LanguageModelV3Prompt,
} from '@ai-sdk/provider';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BedrockChatLanguageModel } from './bedrock-chat-language-model';

const fixture = JSON.parse(
  fs.readFileSync(
    new URL(
      './__fixtures__/amazon-bedrock-openai-sampling-live.json',
      import.meta.url,
    ),
    'utf8',
  ),
);

const prompt: LanguageModelV3Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Say ok.' }] },
];

function createModel({
  modelId,
  unsupportedFeatures,
}: {
  modelId: string;
  unsupportedFeatures: Array<'temperature' | 'topP' | 'stopSequences'>;
}) {
  const requestBodies: Array<{
    inferenceConfig?: Record<string, unknown>;
  }> = [];

  return {
    model: new BedrockChatLanguageModel(modelId, {
      baseUrl: () => 'https://bedrock-runtime.us-east-1.amazonaws.com',
      headers: {},
      fetch: async (_input, init) => {
        const requestBody =
          typeof init?.body === 'string' ? JSON.parse(init.body) : {};
        requestBodies.push(requestBody);

        if (unsupportedFeatures.length > 0) {
          const inferenceConfig = requestBody.inferenceConfig ?? {};
          const unsupportedFeature = unsupportedFeatures.find(
            feature => inferenceConfig[feature] != null,
          );

          if (unsupportedFeature != null) {
            return new Response(
              JSON.stringify(fixture.validationErrors[unsupportedFeature]),
              {
                status: 400,
                headers: { 'content-type': 'application/json' },
              },
            );
          }
        }

        return new Response(
          JSON.stringify(fixture.successWithoutUnsupportedSampling),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        );
      },
      generateId: () => 'test-id',
    }),
    requestBodies,
  };
}

const baseCallOptions: Pick<LanguageModelV3CallOptions, 'prompt'> = { prompt };

describe('issue #21374 OpenAI sampling fields on Bedrock Converse', () => {
  it.each([
    'us.openai.gpt-6-sol',
    'global.openai.gpt-6-luna',
    'us.openai.gpt-5.6-sol',
  ])(
    'completes after omitting unsupported sampling fields for %s',
    async modelId => {
      const { model, requestBodies } = createModel({
        modelId,
        unsupportedFeatures: ['temperature', 'topP', 'stopSequences'],
      });

      const result = await model.doGenerate({
        ...baseCallOptions,
        maxOutputTokens: 16,
        temperature: 0.2,
        topP: 0.5,
        topK: 5,
        stopSequences: ['END'],
      });

      expect(result.content).toContainEqual({ type: 'text', text: 'ok' });
      expect(requestBodies[0]?.inferenceConfig).toEqual({
        maxTokens: 16,
        topK: 5,
      });
      expect(
        result.warnings.flatMap(warning =>
          warning.type === 'unsupported' ? [warning.feature] : [],
        ),
      ).toEqual(['temperature', 'topP', 'stopSequences']);
    },
  );

  it('keeps gpt-oss temperature and topP while omitting stopSequences', async () => {
    const { model, requestBodies } = createModel({
      modelId: 'openai.gpt-oss-120b-1:0',
      unsupportedFeatures: ['stopSequences'],
    });

    const result = await model.doGenerate({
      ...baseCallOptions,
      temperature: 0.2,
      topP: 0.5,
      stopSequences: ['END'],
    });

    expect(result.content).toContainEqual({ type: 'text', text: 'ok' });
    expect(requestBodies[0]?.inferenceConfig).toEqual({
      temperature: 0.2,
      topP: 0.5,
    });
    expect(
      result.warnings.flatMap(warning =>
        warning.type === 'unsupported' ? [warning.feature] : [],
      ),
    ).toEqual(['stopSequences']);
  });

  it('keeps supported Claude sampling and stop sequence fields', async () => {
    const { model, requestBodies } = createModel({
      modelId: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
      unsupportedFeatures: [],
    });

    const result = await model.doGenerate({
      ...baseCallOptions,
      temperature: 0.2,
      topP: 0.5,
      stopSequences: ['END'],
    });

    expect(result.content).toContainEqual({ type: 'text', text: 'ok' });
    expect(requestBodies[0]?.inferenceConfig).toEqual({
      temperature: 0.2,
      topP: 0.5,
      stopSequences: ['END'],
    });
    expect(result.warnings).toEqual([]);
  });
});
