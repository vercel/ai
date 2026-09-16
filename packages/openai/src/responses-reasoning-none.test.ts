import type { LanguageModelV4CallOptions } from '@ai-sdk/provider';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createOpenAI } from './openai-provider';

const cases: Case[] = [
  {
    name: 'explicit summary opt-out',
    modelId: 'gpt-6-astra',
    providerOptions: { openai: { reasoningSummary: null } },
    expected: 'low',
    fallback: true,
  },
  ...['gpt-6-astra', 'gpt-6-astra-2026-09-01', 'o3', 'o3-mini', 'o4-mini'].map(
    modelId => ({ name: modelId, modelId, expected: 'low', fallback: true }),
  ),
  ...['gpt-5', 'gpt-5-mini', 'gpt-5-nano', 'gpt-5-2025-08-07'].map(modelId => ({
    name: modelId,
    modelId,
    expected: 'minimal',
    fallback: true,
  })),
  {
    name: 'GPT-5 Pro minimum',
    modelId: 'gpt-5-pro',
    expected: 'high',
    fallback: true,
  },
  { name: 'disable-capable', modelId: 'gpt-5.1', expected: 'none' },
  {
    name: 'explicit effort',
    modelId: 'gpt-6-astra',
    providerOptions: { openai: { reasoningEffort: 'high' } },
    expected: 'high',
  },
  {
    name: 'explicit unsupported none retains validation',
    modelId: 'gpt-6-astra',
    providerOptions: { openai: { reasoningEffort: 'none' } },
    expected: undefined,
  },
  {
    name: 'unknown model preserves pass-through',
    modelId: 'custom-deployment',
    providerOptions: { openai: { forceReasoning: true } },
    expected: 'none',
  },
  {
    name: 'provider default',
    modelId: 'gpt-6-astra',
    reasoning: 'provider-default',
    expected: undefined,
  },
  {
    name: 'omitted reasoning',
    modelId: 'gpt-6-astra',
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
        ? readFileSync(
            'src/responses/__fixtures__/openai-reasoning-encrypted-content.1.chunks.txt',
            'utf8',
          )
            .split('\n')
            .filter(Boolean)
            .map(line => `data: ${line}\n\n`)
            .join('')
        : readFileSync('src/__fixtures__/evaluation.json', 'utf8');
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
      const model = createOpenAI({ apiKey: 'test', fetch }).responses(
        testCase.modelId,
      );
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
      expect(body.reasoning?.effort).toEqual(testCase.expected);
      expect(body.reasoning?.summary).toBe(
        testCase.providerOptions?.openai?.reasoningSummary === null
          ? undefined
          : testCase.expected != null && testCase.expected !== 'none'
            ? 'detailed'
            : undefined,
      );
      expect(
        warnings.filter(
          warning =>
            warning.type === 'compatibility' && warning.feature === 'reasoning',
        ),
      ).toHaveLength(testCase.fallback ? 1 : 0);
    });
  },
);
