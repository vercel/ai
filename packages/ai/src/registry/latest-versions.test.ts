import { describe, it, expect } from 'vitest';
import { resolveLatestVersion } from './latest-versions';

describe('resolveLatestVersion', () => {
  it('should resolve --latest suffix to actual version', () => {
    expect(resolveLatestVersion('anthropic', 'claude-sonnet--latest')).toBe(
      'claude-sonnet-4-5',
    );
    expect(resolveLatestVersion('openai', 'gpt--latest')).toBe('gpt-4.5');
  });

  it('should return original modelId if no --latest suffix', () => {
    expect(resolveLatestVersion('anthropic', 'claude-sonnet-4-5')).toBe(
      'claude-sonnet-4-5',
    );
    expect(resolveLatestVersion('openai', 'gpt-4o')).toBe('gpt-4o');
  });

  it('should return original modelId if provider not in mapping', () => {
    expect(
      resolveLatestVersion('unknown-provider', 'some-model--latest'),
    ).toBe('some-model--latest');
  });

  it('should return original modelId if base model not in mapping', () => {
    expect(resolveLatestVersion('anthropic', 'unknown-model--latest')).toBe(
      'unknown-model--latest',
    );
  });

  it('should handle all major providers', () => {
    // Anthropic
    expect(resolveLatestVersion('anthropic', 'claude-opus--latest')).toBe(
      'claude-opus-4-1',
    );
    expect(resolveLatestVersion('anthropic', 'claude-haiku--latest')).toBe(
      'claude-haiku-4-5',
    );

    // OpenAI
    expect(resolveLatestVersion('openai', 'gpt-mini--latest')).toBe(
      'gpt-4.5-mini',
    );

    // Google
    expect(resolveLatestVersion('google', 'gemini-flash--latest')).toBe(
      'gemini-2.0-flash-exp',
    );

    // Mistral
    expect(resolveLatestVersion('mistral', 'mistral-large--latest')).toBe(
      'mistral-large-latest',
    );

    // DeepSeek
    expect(resolveLatestVersion('deepseek', 'deepseek-chat--latest')).toBe(
      'deepseek-chat',
    );

    // xAI
    expect(resolveLatestVersion('xai', 'grok--latest')).toBe('grok-2-latest');
  });
});
