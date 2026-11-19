import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  createModelCapabilities,
  createModelCapabilitiesEndpoint,
  declareModelProviderOptions,
} from './model-capabilities';

describe('model capabilities', () => {
  it('omits undeclared endpoints and returns undefined when none are declared', () => {
    const endpoint = createModelCapabilitiesEndpoint('speech', {
      instructions: true,
    });
    expect(
      createModelCapabilities('example', 'model', {
        speech: endpoint,
        language: undefined,
      }),
    ).toEqual({
      provider: 'example',
      modelId: 'model',
      endpoints: {
        speech: {
          operation: 'speech',
          capabilities: { instructions: true },
          providerOptions: {},
        },
      },
    });
    expect(
      createModelCapabilities('example', 'unknown', { speech: undefined }),
    ).toBeUndefined();
    expect(
      createModelCapabilitiesEndpoint('speech', undefined),
    ).toBeUndefined();
  });

  it('preserves false, unknown, and conditional provider-option support', () => {
    const definitions = {
      instructions: { description: 'Instructions.' },
      speed: { description: 'Speed.' },
    };
    const condition = { condition: 'Only for streamed speech.' };
    const support = declareModelProviderOptions(definitions, 'unknown', {
      instructions: false,
    });
    const endpoint = createModelCapabilitiesEndpoint(
      'speech',
      { instructions: false },
      definitions,
      support,
    )!;

    expect(endpoint.providerOptions.instructions).toEqual({
      description: 'Instructions.',
      support: false,
    });
    expect(endpoint.providerOptions.speed.support).toBe('unknown');
    expect(
      declareModelProviderOptions(definitions, true, {
        instructions: condition,
      }),
    ).toEqual({ instructions: condition, speed: true });
    expectTypeOf(endpoint.providerOptions).not.toHaveProperty(
      'previousResponseId',
    );
  });

  it('preserves provider extensions and isolates nested caller mutations', () => {
    const capabilities = { instructions: true, voices: ['example'] };
    const endpoints = {
      speech: createModelCapabilitiesEndpoint('speech', capabilities),
    };
    const model = createModelCapabilities('example', 'model', endpoints)!;
    model.endpoints.speech!.capabilities.voices.push('custom');

    expect(capabilities.voices).toEqual(['example']);
    expectTypeOf(model.provider).toEqualTypeOf<'example'>();
    expectTypeOf(model.endpoints.speech!.capabilities.voices).toEqualTypeOf<
      string[]
    >();
  });
});
