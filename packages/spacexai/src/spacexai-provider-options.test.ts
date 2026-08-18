import {
  InvalidArgumentError,
  NoSuchProviderReferenceError,
} from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';
import { z } from 'zod/v4';
import {
  getSpaceXAIPartOptions,
  parseSpaceXAIProviderOptions,
  resolveSpaceXAIProviderReference,
  spacexaiProviderMetadata,
  spacexaiProviderReference,
} from './spacexai-provider-options';

const schema = z.object({
  serviceTier: z.enum(['default', 'priority']).optional(),
});

describe('parseSpaceXAIProviderOptions', () => {
  it('parses providerOptions.spacexai', async () => {
    await expect(
      parseSpaceXAIProviderOptions({
        providerOptions: { spacexai: { serviceTier: 'priority' } },
        schema,
      }),
    ).resolves.toEqual({ serviceTier: 'priority' });
  });

  it('falls back to providerOptions.xai', async () => {
    await expect(
      parseSpaceXAIProviderOptions({
        providerOptions: { xai: { serviceTier: 'default' } },
        schema,
      }),
    ).resolves.toEqual({ serviceTier: 'default' });
  });

  it('prefers providerOptions.spacexai when both keys are present', async () => {
    await expect(
      parseSpaceXAIProviderOptions({
        providerOptions: {
          xai: { serviceTier: 'default' },
          spacexai: { serviceTier: 'priority' },
        },
        schema,
      }),
    ).resolves.toEqual({ serviceTier: 'priority' });
  });

  it('returns undefined when neither key is present', async () => {
    await expect(
      parseSpaceXAIProviderOptions({
        providerOptions: { openai: { serviceTier: 'priority' } },
        schema,
      }),
    ).resolves.toBeUndefined();
  });

  it('throws InvalidArgumentError for invalid spacexai options', async () => {
    await expect(
      parseSpaceXAIProviderOptions({
        providerOptions: { spacexai: { serviceTier: 'invalid' } },
        schema,
      }),
    ).rejects.toSatisfy(error => InvalidArgumentError.isInstance(error));
  });
});

describe('spacexaiProviderMetadata', () => {
  it('emits both spacexai and xai keys with the same payload', () => {
    expect(spacexaiProviderMetadata({ serviceTier: 'priority' })).toEqual({
      spacexai: { serviceTier: 'priority' },
      xai: { serviceTier: 'priority' },
    });
  });
});

describe('spacexaiProviderReference', () => {
  it('emits both spacexai and xai keys with the same id', () => {
    expect(spacexaiProviderReference('file-abc')).toEqual({
      spacexai: 'file-abc',
      xai: 'file-abc',
    });
  });
});

describe('getSpaceXAIPartOptions', () => {
  it('prefers spacexai over xai', () => {
    expect(
      getSpaceXAIPartOptions({
        xai: { itemId: 'legacy' },
        spacexai: { itemId: 'canonical' },
      }),
    ).toEqual({ itemId: 'canonical' });
  });

  it('falls back to xai', () => {
    expect(getSpaceXAIPartOptions({ xai: { itemId: 'legacy' } })).toEqual({
      itemId: 'legacy',
    });
  });
});

describe('resolveSpaceXAIProviderReference', () => {
  it('resolves the spacexai key', () => {
    expect(
      resolveSpaceXAIProviderReference({
        spacexai: 'file-space',
        openai: 'file-openai',
      }),
    ).toBe('file-space');
  });

  it('falls back to the xai key', () => {
    expect(
      resolveSpaceXAIProviderReference({
        xai: 'file-xai',
        openai: 'file-openai',
      }),
    ).toBe('file-xai');
  });

  it('prefers spacexai when both keys are present', () => {
    expect(
      resolveSpaceXAIProviderReference({
        spacexai: 'file-space',
        xai: 'file-xai',
      }),
    ).toBe('file-space');
  });

  it('throws when neither key is present', () => {
    try {
      resolveSpaceXAIProviderReference({ openai: 'file-openai' });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(NoSuchProviderReferenceError.isInstance(error)).toBe(true);
      expect((error as NoSuchProviderReferenceError).provider).toBe('spacexai');
    }
  });
});
