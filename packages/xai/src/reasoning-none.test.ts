import type { LanguageModelV4CallOptions } from '@ai-sdk/provider';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createXai } from './xai-provider';

const cases: Case[] = [
  ...['grok-4.5', 'grok-4.6'].map(modelId => ({
    name: modelId,
    modelId,
    expected: 'low',
    fallback: true,
  })),
  {
    name: 'explicit effort',
    modelId: 'grok-4.6',
    providerOptions: { xai: { reasoningEffort: 'high' } },
    expected: 'high',
  },
  {
    name: 'explicit none unchanged',
    modelId: 'grok-4.6',
    providerOptions: { xai: { reasoningEffort: 'none' } },
    expected: 'none',
  },
  {
    name: 'no effort control',
    modelId: 'grok-4.20-reasoning',
    expected: undefined,
  },
  { name: 'disable-capable', modelId: 'grok-4.3', expected: 'none' },
  { name: 'unknown model', modelId: 'custom-model', expected: 'none' },
  {
    name: 'provider default',
    modelId: 'grok-4.6',
    reasoning: 'provider-default',
    expected: undefined,
  },
  {
    name: 'omitted reasoning',
    modelId: 'grok-4.6',
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
            'src/responses/__fixtures__/xai-text-streaming.1.chunks.txt',
            'utf8',
          )
            .split('\n')
            .filter(Boolean)
            .map(line => `data: ${line}\n\n`)
            .join('')
        : readFileSync(
            'src/responses/__fixtures__/xai-web-search-tool.1.json',
            'utf8',
          );
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
      const model = createXai({ apiKey: 'test', fetch })(testCase.modelId);
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
      expect(
        warnings.filter(
          warning =>
            warning.type === 'compatibility' && warning.feature === 'reasoning',
        ),
      ).toHaveLength(testCase.fallback ? 1 : 0);
    });
  },
);
