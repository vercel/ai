import { resolveProviderReference } from './resolve-provider-reference';
import { describe, it, expect } from 'vitest';

describe('resolveProviderReference', () => {
  it('should return the provider-specific identifier when the provider key exists', () => {
    const result = resolveProviderReference({
      reference: { openai: 'file-abc', anthropic: 'file-xyz' },
      provider: 'openai',
    });
    expect(result).toBe('file-abc');
  });

  it('should return the correct identifier for a different provider', () => {
    const result = resolveProviderReference({
      reference: { openai: 'file-abc', anthropic: 'file-xyz' },
      provider: 'anthropic',
    });
    expect(result).toBe('file-xyz');
  });

  it('should throw a descriptive error when no entry exists for the given provider', () => {
    expect(() =>
      resolveProviderReference({
        reference: { anthropic: 'file-xyz', google: 'file-123' },
        provider: 'openai',
      }),
    ).toThrow(
      "No reference found for provider 'openai'. Available providers: anthropic, google",
    );
  });

  it('should throw when reference is empty', () => {
    expect(() =>
      resolveProviderReference({
        reference: {},
        provider: 'openai',
      }),
    ).toThrow(
      "No reference found for provider 'openai'. Available providers: ",
    );
  });

  it('should work with a single-provider reference', () => {
    const result = resolveProviderReference({
      reference: { openai: 'file-only' },
      provider: 'openai',
    });
    expect(result).toBe('file-only');
  });
});
