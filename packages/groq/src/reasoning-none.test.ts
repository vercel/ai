import type { LanguageModelV4CallOptions } from '@ai-sdk/provider';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createGroq } from './groq-provider';

const cases: Case[] = [
  ...['openai/gpt-oss-20b', 'openai/gpt-oss-120b'].map(modelId => ({
    name: modelId,
    modelId,
    expected: 'low',
    fallback: true,
  })),
  ...['qwen/qwen3.6-27b', 'qwen/qwen3.8-27b'].map(modelId => ({
    name: modelId,
    modelId,
    expected: 'none',
  })),
  {
    name: 'explicit effort wins',
    modelId: 'openai/gpt-oss-120b',
    providerOptions: { groq: { reasoningEffort: 'high' } },
    expected: 'high',
  },
  {
    name: 'unknown model keeps omission',
    modelId: 'custom-model',
    expected: undefined,
  },
  {
    name: 'provider default',
    modelId: 'openai/gpt-oss-120b',
    reasoning: 'provider-default',
    expected: undefined,
  },
  {
    name: 'omitted reasoning',
    modelId: 'openai/gpt-oss-120b',
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
        ? readFileSync('src/__fixtures__/groq-text.chunks.txt', 'utf8')
            .split('\n')
            .filter(Boolean)
            .map(line => `data: ${line}\n\n`)
            .join('')
        : readFileSync('src/__fixtures__/groq-text.json', 'utf8');
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
      const model = createGroq({ apiKey: 'test', fetch })(testCase.modelId);
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
      expect(body.reasoning_effort).toEqual(testCase.expected);
      expect(
        warnings.filter(
          warning =>
            warning.type === 'compatibility' && warning.feature === 'reasoning',
        ),
      ).toHaveLength(testCase.fallback ? 1 : 0);
    });
  },
);
