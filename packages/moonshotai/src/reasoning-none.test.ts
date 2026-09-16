import type { LanguageModelV4CallOptions } from '@ai-sdk/provider';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createMoonshotAI } from './moonshotai-provider';

const cases: Case[] = [
  {
    name: 'K3 minimum',
    modelId: 'kimi-k3',
    expected: { effort: 'low', thinking: undefined },
    fallback: true,
  },
  {
    name: 'K3 explicit effort',
    modelId: 'kimi-k3',
    providerOptions: { moonshotai: { reasoningEffort: 'max' } },
    expected: { effort: 'max', thinking: undefined },
  },
  ...['kimi-k2.5', 'kimi-k2.6'].map(modelId => ({
    name: modelId,
    modelId,
    expected: { effort: undefined, thinking: { type: 'disabled' } },
  })),
  {
    name: 'K2.7 no control',
    modelId: 'kimi-k2.7',
    expected: { effort: undefined, thinking: undefined },
  },
  {
    name: 'unknown model',
    modelId: 'custom-model',
    expected: { effort: undefined, thinking: undefined },
  },
  {
    name: 'provider default',
    modelId: 'kimi-k3',
    reasoning: 'provider-default',
    expected: { effort: undefined, thinking: undefined },
  },
  {
    name: 'omitted reasoning',
    modelId: 'kimi-k3',
    reasoning: undefined,
    expected: { effort: undefined, thinking: undefined },
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
        ? readFileSync('src/__fixtures__/moonshotai-stream.chunks.txt', 'utf8')
            .split('\n')
            .filter(Boolean)
            .map(line => `data: ${line}\n\n`)
            .join('')
        : readFileSync('src/__fixtures__/moonshotai-text.json', 'utf8');
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
      const model = createMoonshotAI({ apiKey: 'test', fetch })(
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
      expect({
        effort: body.reasoning_effort,
        thinking: body.thinking,
      }).toEqual(testCase.expected);
      expect(
        warnings.filter(
          warning =>
            warning.type === 'compatibility' && warning.feature === 'reasoning',
        ),
      ).toHaveLength(testCase.fallback ? 1 : 0);
    });
  },
);
