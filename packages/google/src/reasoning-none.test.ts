import type { LanguageModelV4CallOptions } from '@ai-sdk/provider';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createGoogle } from './google-provider';

const cases: Case[] = [
  ...[
    'gemini-2.5-pro',
    'gemini-2.5-pro-preview-06-05',
    'publishers/google/models/gemini-2.5-pro',
  ].map(modelId => ({
    name: modelId,
    modelId,
    expected: { thinkingBudget: 128 },
    fallback: true,
  })),
  ...['gemini-3-pro-preview', 'gemini-3.1-pro-preview', 'gemini-3.7-flash'].map(
    modelId => ({ name: modelId, modelId, expected: { thinkingLevel: 'low' } }),
  ),
  {
    name: 'earlier flash minimum',
    modelId: 'gemini-3-flash-preview',
    expected: { thinkingLevel: 'minimal' },
  },
  {
    name: 'disable-capable',
    modelId: 'gemini-2.5-flash',
    expected: { thinkingBudget: 0 },
  },
  {
    name: 'explicit budget suppresses level',
    modelId: 'gemini-3.1-pro-preview',
    providerOptions: { google: { thinkingConfig: { thinkingBudget: 1024 } } },
    expected: { thinkingBudget: 1024 },
  },
  {
    name: 'explicit level suppresses budget',
    modelId: 'gemini-2.5-pro',
    providerOptions: { google: { thinkingConfig: { thinkingLevel: 'high' } } },
    expected: { thinkingLevel: 'high' },
  },
  {
    name: 'explicit zero unchanged',
    modelId: 'gemini-2.5-pro',
    providerOptions: { google: { thinkingConfig: { thinkingBudget: 0 } } },
    expected: { thinkingBudget: 0 },
  },
  {
    name: 'display option preserves mapping',
    modelId: 'gemini-2.5-pro',
    providerOptions: { google: { thinkingConfig: { includeThoughts: true } } },
    expected: { thinkingBudget: 128, includeThoughts: true },
    fallback: true,
  },
  {
    name: 'unknown model unchanged',
    modelId: 'custom-model',
    expected: { thinkingBudget: 0 },
  },
  {
    name: 'provider default',
    modelId: 'gemini-2.5-pro',
    reasoning: 'provider-default',
    expected: undefined,
  },
  {
    name: 'omitted reasoning',
    modelId: 'gemini-2.5-pro',
    reasoning: undefined,
    expected: undefined,
  },
];

const prompt: LanguageModelV4CallOptions['prompt'] = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

type Case = {
  name: string;
  modelId: string;
  reasoning?: LanguageModelV4CallOptions['reasoning'];
  providerOptions?: LanguageModelV4CallOptions['providerOptions'];
  expected: unknown;
  fallback?: boolean;
};

describe.each(['doGenerate', 'doStream'] as const)(
  '%s reasoning none',
  method => {
    it.each(cases)('$name', async testCase => {
      const isStreaming = method === 'doStream';
      const response = isStreaming
        ? readFileSync('src/__fixtures__/google-text.chunks.txt', 'utf8')
            .split('\n')
            .filter(Boolean)
            .map(line => `data: ${line}\n\n`)
            .join('')
        : readFileSync('src/__fixtures__/google-text.json', 'utf8');
      const fetch = vi.fn<typeof globalThis.fetch>(
        async () =>
          new Response(response, {
            headers: {
              'content-type': isStreaming
                ? 'text/event-stream'
                : 'application/json',
            },
          }),
      );
      const model = createGoogle({ apiKey: 'test', fetch })(testCase.modelId);
      const options: LanguageModelV4CallOptions = {
        prompt,
        reasoning: 'reasoning' in testCase ? testCase.reasoning : 'none',
        providerOptions: testCase.providerOptions,
      };
      const result = await model[method](options);
      const warnings =
        'stream' in result
          ? (await convertReadableStreamToArray(result.stream)).flatMap(
              part => {
                expect(part.type).not.toBe('error');
                return part.type === 'stream-start' ? part.warnings : [];
              },
            )
          : result.warnings;
      const body = JSON.parse(fetch.mock.calls[0][1]!.body as string);
      expect(body.generationConfig?.thinkingConfig).toEqual(testCase.expected);
      expect(
        warnings.filter(
          warning =>
            warning.type === 'compatibility' && warning.feature === 'reasoning',
        ),
      ).toHaveLength(testCase.fallback ? 1 : 0);
    });
  },
);
