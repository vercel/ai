import { describe, expect, it } from 'vitest';
import { normalizeAnthropicBaseURL } from './normalize-anthropic-base-url';

describe('normalizeAnthropicBaseURL', () => {
  it('appends /v1 when the canonical Anthropic host is provided without a path', () => {
    expect(normalizeAnthropicBaseURL('https://api.anthropic.com')).toBe(
      'https://api.anthropic.com/v1',
    );
  });

  it('appends /v1 when the canonical Anthropic host has only a trailing slash', () => {
    expect(normalizeAnthropicBaseURL('https://api.anthropic.com/')).toBe(
      'https://api.anthropic.com/v1',
    );
  });

  it('returns the canonical Anthropic host unchanged when /v1 is already present', () => {
    expect(normalizeAnthropicBaseURL('https://api.anthropic.com/v1')).toBe(
      'https://api.anthropic.com/v1',
    );
  });

  it('leaves custom proxies on the Anthropic host alone when they specify a path', () => {
    expect(
      normalizeAnthropicBaseURL('https://api.anthropic.com/custom/path'),
    ).toBe('https://api.anthropic.com/custom/path');
  });

  it('leaves third-party proxy URLs alone', () => {
    expect(normalizeAnthropicBaseURL('https://proxy.example.com')).toBe(
      'https://proxy.example.com',
    );
    expect(normalizeAnthropicBaseURL('https://litellm.example.com/v1')).toBe(
      'https://litellm.example.com/v1',
    );
  });

  it('returns undefined when undefined is provided', () => {
    expect(normalizeAnthropicBaseURL(undefined)).toBeUndefined();
  });

  it('returns invalid URLs unchanged', () => {
    expect(normalizeAnthropicBaseURL('not a url')).toBe('not a url');
  });
});
