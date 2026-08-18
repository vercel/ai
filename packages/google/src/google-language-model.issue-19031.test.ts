import type {
  LanguageModelV4CallOptions,
  LanguageModelV4Prompt,
} from '@ai-sdk/provider';
import * as fs from 'fs';
import { describe, expect, it } from 'vitest';
import { createGoogle } from './google-provider';

const prompt: LanguageModelV4Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Reply with OK.' }] },
];

const unsupportedResponse = JSON.parse(
  fs.readFileSync(
    'src/__fixtures__/google-thinking-level-minimal-unsupported.json',
    'utf8',
  ),
);

const successResponse = JSON.parse(
  fs.readFileSync(
    'src/__fixtures__/google-thinking-level-low-success.json',
    'utf8',
  ),
);

type Reasoning = Exclude<
  LanguageModelV4CallOptions['reasoning'],
  'provider-default' | undefined
>;

async function generateWithRecordedProviderResponses({
  modelId,
  reasoning,
  rejectMinimal,
}: {
  modelId: string;
  reasoning: Reasoning;
  rejectMinimal: boolean;
}) {
  let thinkingLevel: unknown;

  const google = createGoogle({
    apiKey: 'test-api-key',
    generateId: () => 'test-id',
    fetch: async (_input, init) => {
      if (typeof init?.body !== 'string') {
        throw new Error('Expected a JSON request body.');
      }

      const requestBody = JSON.parse(init.body);
      thinkingLevel =
        requestBody.generationConfig?.thinkingConfig?.thinkingLevel;

      const isUnsupported = rejectMinimal && thinkingLevel === 'minimal';

      return new Response(
        JSON.stringify(isUnsupported ? unsupportedResponse : successResponse),
        {
          status: isUnsupported ? 400 : 200,
          headers: { 'content-type': 'application/json' },
        },
      );
    },
  });

  const result = await google(modelId).doGenerate({
    prompt,
    reasoning,
  });

  return { result, thinkingLevel };
}

describe('issue #19031: Gemini Flash minimum thinking level', () => {
  it.each([
    ['gemini-3.7-flash', 'minimal'],
    ['gemini-3.7-flash', 'none'],
    ['gemini-3.7-flash-video-understanding-eap', 'minimal'],
    ['gemini-3.7-flash-video-understanding-eap', 'none'],
    ['gemini-flash-latest', 'minimal'],
    ['gemini-flash-latest', 'none'],
  ] as const)(
    'uses low for %s with reasoning %s so the recorded provider request succeeds',
    async (modelId, reasoning) => {
      const { result, thinkingLevel } =
        await generateWithRecordedProviderResponses({
          modelId,
          reasoning,
          rejectMinimal: true,
        });

      expect(thinkingLevel).toBe('low');
      expect(result.content).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'text', text: 'OK' }),
        ]),
      );
    },
  );

  it.each([
    ['models/gemini-3.7-flash', 'low'],
    ['gemini-3.7-flash-video-understanding-eap', 'low'],
    ['gemini-3.8-flash', 'low'],
    ['gemini-3.10-flash-preview', 'low'],
    ['gemini-4.0-flash', 'low'],
    ['gemini-flash-latest', 'low'],
    ['gemini-3-flash-preview', 'minimal'],
    ['gemini-3.5-flash', 'minimal'],
    ['gemini-3.6-flash', 'minimal'],
    ['gemini-3.5-flash-lite', 'minimal'],
    ['gemini-3.7-flash-lite', 'minimal'],
    ['gemini-flash-lite-latest', 'minimal'],
  ] as const)(
    'maps reasoning minimal for %s to thinkingLevel %s',
    async (modelId, expectedThinkingLevel) => {
      const { thinkingLevel } = await generateWithRecordedProviderResponses({
        modelId,
        reasoning: 'minimal',
        rejectMinimal: false,
      });

      expect(thinkingLevel).toBe(expectedThinkingLevel);
    },
  );
});
