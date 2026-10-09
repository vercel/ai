import type { LanguageModelV4Prompt } from '@ai-sdk/provider';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createGoogle } from './google-provider';

type ThinkingConfig = {
  thinkingBudget?: number;
  includeThoughts?: boolean;
  thinkingLevel?: string;
};

type RequestBody = {
  generationConfig?: {
    thinkingConfig?: ThinkingConfig;
  };
};

const prompt: LanguageModelV4Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Reply with OK.' }] },
];

const liveErrors = JSON.parse(
  fs.readFileSync(
    new URL('./__fixtures__/issue-22372-live-errors.json', import.meta.url),
    'utf8',
  ),
) as {
  thinkingLevelAndBudgetResponse: unknown;
};

async function prepareRequest({
  modelId,
  reasoning,
  providerThinkingConfig,
}: {
  modelId: string;
  reasoning: 'none' | 'minimal' | 'high';
  providerThinkingConfig?: ThinkingConfig;
}) {
  let requestBody: RequestBody | undefined;
  const provider = createGoogle({
    apiKey: 'test-api-key',
    fetch: async (_input, init) => {
      requestBody = (await new Response(
        init?.body as BodyInit,
      ).json()) as RequestBody;

      return new Response(
        JSON.stringify(liveErrors.thinkingLevelAndBudgetResponse),
        {
          status: 400,
          headers: { 'content-type': 'application/json' },
        },
      );
    },
  });

  try {
    await provider(modelId).doGenerate({
      prompt,
      reasoning,
      providerOptions: providerThinkingConfig
        ? { google: { thinkingConfig: providerThinkingConfig } }
        : undefined,
    });
  } catch {
    // The recorded provider response is an expected 400. The regression
    // assertion is the request that the SDK prepared before that response.
  }

  return requestBody?.generationConfig?.thinkingConfig;
}

describe('issue #22372', () => {
  it.each([
    {
      modelId: 'au.gemini-3.5-flash',
      expected: { thinkingLevel: 'minimal', includeThoughts: false },
      providerThinkingConfig: { includeThoughts: false },
    },
    {
      modelId: 'eu.gemini-3.5-flash',
      expected: { thinkingLevel: 'minimal' },
      providerThinkingConfig: undefined,
    },
    {
      modelId: 'us.gemini-3.1-pro',
      expected: { thinkingLevel: 'low' },
      providerThinkingConfig: undefined,
    },
  ])(
    'uses Gemini 3 thinking levels for regional model id $modelId',
    async ({ modelId, expected, providerThinkingConfig }) => {
      expect(
        await prepareRequest({
          modelId,
          reasoning: 'none',
          providerThinkingConfig,
        }),
      ).toEqual(expected);
    },
  );

  it.each([
    { modelId: 'gemini-3.5-pro', reasoning: 'none' as const },
    { modelId: 'gemini-3.5-pro', reasoning: 'minimal' as const },
    { modelId: 'gemini-3.1-pro', reasoning: 'none' as const },
    { modelId: 'gemini-3.1-pro', reasoning: 'minimal' as const },
  ])(
    'uses low as the minimum for $modelId with reasoning $reasoning',
    async ({ modelId, reasoning }) => {
      expect(await prepareRequest({ modelId, reasoning })).toEqual({
        thinkingLevel: 'low',
      });
    },
  );

  it('does not send thinkingLevel with an explicit thinkingBudget', async () => {
    expect(
      await prepareRequest({
        modelId: 'gemini-3-pro-preview',
        reasoning: 'high',
        providerThinkingConfig: { thinkingBudget: 999 },
      }),
    ).toEqual({
      thinkingBudget: 999,
    });
  });
});
