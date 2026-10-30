import { getModelCapabilities } from '@ai-sdk/provider-utils';
import type { KnownModelId } from '@ai-sdk/provider-utils/test';
import { describe, expect, expectTypeOf, it } from 'vitest';
import type { AnthropicModelId } from './anthropic-language-model-options';
import { anthropicLanguageModelCatalog } from './anthropic-model-catalog';

// Must contain exactly the model IDs of `AnthropicModelId`. Type checking
// fails when an ID is missing or not part of the type.
const modelIds = [
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
  Exclude<KnownModelId<AnthropicModelId>, (typeof modelIds)[number]>
>().toBeNever();

const get = (modelId: string) =>
  getModelCapabilities(anthropicLanguageModelCatalog, modelId);

describe('anthropicLanguageModelCatalog', () => {
  it.each(modelIds)('knows %s', modelId => {
    expect(get(modelId).isKnownModel).toBe(true);
  });

  it('resolves the capabilities of every model ID', () => {
    expect(
      Object.fromEntries(
        modelIds.map(modelId => [modelId, get(modelId).capabilities]),
      ),
    ).toMatchSnapshot();
  });

  it('resolves model IDs that are not listed', () => {
    expect(
      Object.fromEntries(
        [
          // Host and snapshot model IDs:
          'claude-sonnet-4-5@20250929',
          'anthropic.claude-sonnet-4-5-20250929-v1:0',
          'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
          'arn:aws:bedrock:us-east-1:123456789012:inference-profile/global.anthropic.claude-opus-4-6-v1',
          'claude-sonnet-4@20250514',
          'claude-opus-4@20250514',
          // Not a prefix match of claude-opus-4-6:
          'claude-opus-4-60',
          // Unknown Claude models:
          'claude-future-9',
          'us.anthropic.claude-future-9-20990101-v1:0',
          // Legacy Claude models:
          'anthropic.claude-3-5-sonnet-20241022-v2:0',
          'us.anthropic.claude-3-7-sonnet-20250219-v1:0',
          'anthropic.claude-v2:1',
          'anthropic.claude-instant-v1',
          // Unknown models:
          'third-party-future-model',
        ].map(modelId => [modelId, get(modelId)]),
      ),
    ).toMatchSnapshot();
  });
});
