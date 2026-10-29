import { getModelCapabilities } from '@ai-sdk/provider-utils';
import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  anthropicLanguageModelCapabilities,
  normalizeClaudeModelId,
} from './anthropic-language-model-capabilities';
import type { AnthropicModelId } from './anthropic-language-model-options';

type KnownModelId<MODEL_ID> = MODEL_ID extends string
  ? string extends MODEL_ID
    ? never
    : MODEL_ID
  : never;

// Type checking fails when this list and `AnthropicModelId` differ.
const anthropicModelIds = [
  'claude-3-haiku-20240307',
  'claude-haiku-4-5-20251001',
  'claude-haiku-4-5',
  'claude-haiku-5-5',
  'claude-opus-4-0',
  'claude-opus-4-20250514',
  'claude-opus-4-1-20250805',
  'claude-opus-4-1',
  'claude-opus-4-5',
  'claude-opus-4-5-20251101',
  'claude-sonnet-4-0',
  'claude-sonnet-4-20250514',
  'claude-sonnet-4-5-20250929',
  'claude-sonnet-4-5',
  'claude-sonnet-4-6',
  'claude-opus-4-6',
  'claude-opus-4-7',
  'claude-opus-4-8',
  'claude-opus-5',
  'claude-opus-5-5',
  'claude-fable-5',
  'claude-fable-5-1',
  'claude-sonnet-5',
  'claude-sonnet-5-5',
] as const satisfies readonly KnownModelId<AnthropicModelId>[];

expectTypeOf<
  Exclude<KnownModelId<AnthropicModelId>, (typeof anthropicModelIds)[number]>
>().toBeNever();

describe('anthropicLanguageModelCapabilities', () => {
  it.each(anthropicModelIds)('knows %s', modelId => {
    expect(
      getModelCapabilities(anthropicLanguageModelCapabilities, modelId)
        .isKnownModel,
    ).toBe(true);
  });

  it('returns the capabilities of all known model IDs', () => {
    expect(
      Object.fromEntries(
        anthropicModelIds.map(modelId => [
          modelId,
          getModelCapabilities(anthropicLanguageModelCapabilities, modelId)
            .capabilities,
        ]),
      ),
    ).toMatchSnapshot();
  });

  it.each([
    ['claude-sonnet-4-5@20250929', 'claude-sonnet-4-5'],
    ['claude-sonnet-4@20250514', 'claude-sonnet-4'],
    ['us.anthropic.claude-sonnet-4-5-20250929-v1:0', 'claude-sonnet-4-5'],
    ['global.anthropic.claude-opus-4-6-v1', 'claude-opus-4-6'],
    ['anthropic.claude-opus-5-5', 'claude-opus-5-5'],
    [
      'arn:aws:bedrock:us-east-1:123456789012:inference-profile/us.anthropic.claude-haiku-4-5-20251001-v1:0',
      'claude-haiku-4-5',
    ],
  ])('matches the platform model ID %s as %s', (modelId, claudeModelId) => {
    expect(
      getModelCapabilities(anthropicLanguageModelCapabilities, modelId),
    ).toEqual(
      getModelCapabilities(anthropicLanguageModelCapabilities, claudeModelId),
    );
  });

  it('matches model IDs exactly instead of by prefix', () => {
    expect(
      getModelCapabilities(
        anthropicLanguageModelCapabilities,
        'claude-opus-5-5',
      ).capabilities,
    ).not.toEqual(
      getModelCapabilities(anthropicLanguageModelCapabilities, 'claude-opus-5')
        .capabilities,
    );
    expect(
      getModelCapabilities(
        anthropicLanguageModelCapabilities,
        'claude-opus-4-60',
      ).isKnownModel,
    ).toBe(false);
  });

  it.each(['claude-future-9', 'us.anthropic.claude-future-9-20990101-v1:0'])(
    'returns current-generation capabilities for the unknown Claude model %s',
    modelId => {
      expect(getModelCapabilities(anthropicLanguageModelCapabilities, modelId))
        .toMatchInlineSnapshot(`
          {
            "capabilities": {
              "forcedToolUse": true,
              "maxOutputTokens": 128000,
              "samplingParameters": false,
              "structuredOutput": true,
              "thinking": {
                "adaptive": {
                  "efforts": [
                    "low",
                    "medium",
                    "high",
                    "xhigh",
                    "max",
                  ],
                },
                "budget": true,
                "disabled": {
                  "maxEffort": "high",
                },
              },
            },
            "isKnownModel": false,
          }
        `);
    },
  );

  it.each([
    'anthropic.claude-3-5-sonnet-20241022-v2:0',
    'us.anthropic.claude-3-7-sonnet-20250219-v1:0',
    'anthropic.claude-v2:1',
    'anthropic.claude-instant-v1',
    'third-party-future-model',
  ])(
    'returns conservative capabilities for the legacy or non-Claude model %s',
    modelId => {
      expect(getModelCapabilities(anthropicLanguageModelCapabilities, modelId))
        .toMatchInlineSnapshot(`
          {
            "capabilities": {
              "forcedToolUse": true,
              "maxOutputTokens": 4096,
              "samplingParameters": true,
              "structuredOutput": false,
              "thinking": {
                "budget": true,
                "disabled": {},
              },
            },
            "isKnownModel": false,
          }
        `);
    },
  );
});

describe('normalizeClaudeModelId', () => {
  it.each([
    ['claude-sonnet-4-5-20250929', 'claude-sonnet-4-5'],
    ['claude-sonnet-4-5@20250929', 'claude-sonnet-4-5'],
    ['us.anthropic.claude-sonnet-4-5-20250929-v1:0', 'claude-sonnet-4-5'],
    ['anthropic.claude-3-sonnet-20240229-v1:0:200k', 'claude-3-sonnet'],
    ['anthropic.claude-v2:1', 'claude-v2:1'],
    ['MiniMax-M2', 'MiniMax-M2'],
  ])('normalizes %s to %s', (modelId, normalizedModelId) => {
    expect(normalizeClaudeModelId(modelId)).toBe(normalizedModelId);
  });
});
