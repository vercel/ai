import { describe, expect, expectTypeOf, it } from 'vitest';
import { anthropicModelCapabilities } from './index';
import { anthropicModelCatalog } from './anthropic-model-catalog';

describe('anthropicModelCapabilities', () => {
  it('exposes the catalog through Messages with Anthropic-specific types', () => {
    const model = anthropicModelCapabilities('claude-opus-4-6')!;
    const messages = model.endpoints.messages!;

    expect(model.provider).toBe('anthropic');
    expect(Object.keys(model.endpoints)).toEqual(['messages']);
    expect(messages.capabilities).toEqual(
      anthropicModelCatalog['claude-opus-4-6'].capabilities.language,
    );
    expect(messages.capabilities.reasoning.adaptive).toBe(true);
    expect(messages.providerOptions.speed.support).toBe(true);
    expect(messages.providerOptions.thinking).toMatchObject({ support: true });
    expectTypeOf(model.endpoints).not.toHaveProperty('responses');
    expectTypeOf(messages.capabilities.tools).not.toHaveProperty(
      'googleSearch',
    );
    expect(model).not.toHaveProperty('requestConfig');
    expect(messages).not.toHaveProperty('requestConfig');
  });

  it('preserves unknown and unsupported capabilities for known IDs', () => {
    expect(
      anthropicModelCapabilities('claude-opus-4-5')!.endpoints.messages!
        .capabilities.compaction,
    ).toBe(false);
    const snapshot = anthropicModelCapabilities('claude-haiku-4-5-20251001')!;
    expect(snapshot.endpoints.messages!.capabilities.inputs.image).toBe(
      'unknown',
    );
    expect(snapshot.endpoints.messages!.providerOptions.speed.support).toBe(
      'unknown',
    );
  });

  it.each([
    'custom-model',
    'claude-future',
    'constructor',
    'toString',
    '__proto__',
  ])('returns undefined for %s', modelId => {
    expect(anthropicModelCapabilities(modelId)).toBeUndefined();
  });

  it('detaches results from the runtime catalog', () => {
    const model = anthropicModelCapabilities('claude-opus-4-6')!;
    (
      model.endpoints.messages!.capabilities.inputs as { image: boolean }
    ).image = false;
    expect(
      anthropicModelCapabilities('claude-opus-4-6')!.endpoints.messages!
        .capabilities.inputs.image,
    ).toBe(true);
  });
});
