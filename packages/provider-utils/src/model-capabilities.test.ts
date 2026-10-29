import { describe, expect, it } from 'vitest';
import {
  defineModelCapabilities,
  getModelCapabilities,
} from './model-capabilities';

const modelCapabilities = defineModelCapabilities<{ generation: string }>({
  normalize: modelId => modelId.replace(/-\d{8}$/, ''),
  entries: [
    {
      match: /^model-1(?:-|$)/,
      capabilities: { generation: 'model-1 family' },
    },
    { match: 'model-1-5', capabilities: { generation: 'model-1-5' } },
    {
      match: ['model-2', 'model-2-mini'],
      capabilities: { generation: 'model-2' },
    },
    { match: /^model-1-5/, capabilities: { generation: 'model-1-5 family' } },
  ],
  fallback: modelId => ({ generation: `fallback for ${modelId}` }),
});

describe('getModelCapabilities', () => {
  it('matches a model ID exactly', () => {
    expect(getModelCapabilities(modelCapabilities, 'model-2-mini')).toEqual({
      capabilities: { generation: 'model-2' },
      isKnownModel: true,
    });
  });

  it('matches the normalized model ID', () => {
    expect(getModelCapabilities(modelCapabilities, 'model-2-20250101')).toEqual(
      {
        capabilities: { generation: 'model-2' },
        isKnownModel: true,
      },
    );
  });

  it('checks exact matches before patterns', () => {
    expect(getModelCapabilities(modelCapabilities, 'model-1-5')).toEqual({
      capabilities: { generation: 'model-1-5' },
      isKnownModel: true,
    });
  });

  it('tests patterns in the order of the entries', () => {
    expect(getModelCapabilities(modelCapabilities, 'model-1-5-mini')).toEqual({
      capabilities: { generation: 'model-1 family' },
      isKnownModel: true,
    });
  });

  it('passes the original model ID to the fallback', () => {
    expect(getModelCapabilities(modelCapabilities, 'model-3-20250101')).toEqual(
      {
        capabilities: { generation: 'fallback for model-3-20250101' },
        isKnownModel: false,
      },
    );
  });
});

describe('defineModelCapabilities', () => {
  it('throws for a duplicate exact match', () => {
    expect(() =>
      defineModelCapabilities({
        entries: [
          { match: 'model-1', capabilities: {} },
          { match: ['model-2', 'model-1'], capabilities: {} },
        ],
        fallback: () => ({}),
      }),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: Duplicate model capabilities for "model-1".]`,
    );
  });
});
