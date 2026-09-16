import type { LanguageModelV4CallOptions } from '@ai-sdk/provider';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createAnthropic } from './anthropic-provider';

const cases: Case[] = [
  ...[
    'claude-fable-5',
    'claude-fable-5-1',
    'claude-mythos-5',
    'claude-mythos-preview',
    'us.anthropic.claude-fable-5-v1:0',
    'claude-fable-5@20260901',
  ].map(modelId => ({
    name: modelId,
    modelId,
    expected: { thinking: { type: 'adaptive' }, effort: 'low' },
    fallback: true,
  })),
  ...['claude-sonnet-5', 'claude-opus-5', 'custom-model'].map(modelId => ({
    name: modelId,
    modelId,
    expected: { thinking: { type: 'disabled' }, effort: undefined },
  })),
  {
    name: 'explicit effort',
    modelId: 'claude-fable-5',
    providerOptions: { anthropic: { effort: 'high' } },
    expected: { thinking: undefined, effort: 'high' },
  },
  {
    name: 'explicit thinking',
    modelId: 'claude-fable-5',
    providerOptions: {
      anthropic: { thinking: { type: 'adaptive', display: 'summarized' } },
    },
    expected: {
      thinking: { type: 'adaptive', display: 'summarized' },
      effort: undefined,
    },
  },
  {
    name: 'explicit disabled unchanged',
    modelId: 'claude-fable-5',
    providerOptions: { anthropic: { thinking: { type: 'disabled' } } },
    expected: { thinking: { type: 'disabled' }, effort: undefined },
  },
  {
    name: 'provider default',
    modelId: 'claude-fable-5',
    reasoning: 'provider-default',
    expected: { thinking: undefined, effort: undefined },
  },
  {
    name: 'omitted reasoning',
    modelId: 'claude-fable-5',
    reasoning: undefined,
    expected: { thinking: undefined, effort: undefined },
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
        ? readFileSync('src/__fixtures__/anthropic-text.chunks.txt', 'utf8')
            .split('\n')
            .filter(Boolean)
            .map(line => `data: ${line}\n\n`)
            .join('')
        : readFileSync('src/__fixtures__/anthropic-text.json', 'utf8');
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
      const model = createAnthropic({ apiKey: 'test', fetch })(
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
        thinking: body.thinking,
        effort: body.output_config?.effort,
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
