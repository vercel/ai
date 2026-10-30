import { describe, expect, it } from 'vitest';
import { defineModelCatalog, getModelCapabilities } from './model-catalog';

const catalog = defineModelCatalog<{ name: string }>({
  normalize: modelId => modelId.replace(/-\d{8}$/, ''),
  entries: [
    { match: 'model-5', capabilities: { name: 'model-5' } },
    { match: ['model-5-5', 'model-5-6'], capabilities: { name: 'model-5-5' } },
    { match: /^model-5/, capabilities: { name: 'model-5 family' } },
    { match: /^model-/, capabilities: { name: 'model family' } },
  ],
  fallback: modelId => ({ name: `fallback for ${modelId}` }),
});

describe('getModelCapabilities', () => {
  it('matches exact model IDs', () => {
    expect(getModelCapabilities(catalog, 'model-5')).toEqual({
      capabilities: { name: 'model-5' },
      isKnownModel: true,
    });
    expect(getModelCapabilities(catalog, 'model-5-6')).toEqual({
      capabilities: { name: 'model-5-5' },
      isKnownModel: true,
    });
  });

  it('checks exact model IDs before patterns', () => {
    expect(getModelCapabilities(catalog, 'model-5-5').capabilities).toEqual({
      name: 'model-5-5',
    });
  });

  it('tests patterns in order', () => {
    expect(getModelCapabilities(catalog, 'model-5-7').capabilities).toEqual({
      name: 'model-5 family',
    });
    expect(getModelCapabilities(catalog, 'model-6').capabilities).toEqual({
      name: 'model family',
    });
  });

  it('normalizes model IDs before matching', () => {
    expect(getModelCapabilities(catalog, 'model-5-5-20260101')).toEqual({
      capabilities: { name: 'model-5-5' },
      isKnownModel: true,
    });
  });

  it('uses the fallback with the original model ID for unknown models', () => {
    expect(getModelCapabilities(catalog, 'other-20260101')).toEqual({
      capabilities: { name: 'fallback for other-20260101' },
      isKnownModel: false,
    });
  });

  it('does not match inherited object properties', () => {
    expect(getModelCapabilities(catalog, 'constructor').isKnownModel).toBe(
      false,
    );
  });
});

describe('defineModelCatalog', () => {
  it('lists exact model IDs as known models', () => {
    expect(Object.keys(catalog.knownModels)).toEqual([
      'model-5',
      'model-5-5',
      'model-5-6',
    ]);
  });

  it('rejects duplicate model IDs', () => {
    expect(() =>
      defineModelCatalog({
        entries: [
          { match: 'model', capabilities: {} },
          { match: ['other', 'model'], capabilities: {} },
        ],
        fallback: () => ({}),
      }),
    ).toThrow('Duplicate model catalog entry for "model".');
  });
});
