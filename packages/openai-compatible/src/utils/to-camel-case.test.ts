import { describe, it, expect } from 'vitest';
import { toCamelCase, resolveProviderOptionsKey } from './to-camel-case';

describe('toCamelCase', () => {
  it('should convert hyphenated names to camelCase', () => {
    expect(toCamelCase('provider-name')).toBe('providerName');
  });

  it('should convert underscored names to camelCase', () => {
    expect(toCamelCase('provider_name')).toBe('providerName');
  });

  it('should handle multiple separators', () => {
    expect(toCamelCase('my-provider-name')).toBe('myProviderName');
  });

  it('should return the same string when already camelCase', () => {
    expect(toCamelCase('providerName')).toBe('providerName');
  });

  it('should return the same string when no separators', () => {
    expect(toCamelCase('openai')).toBe('openai');
  });

  it('should handle empty string', () => {
    expect(toCamelCase('')).toBe('');
  });
});

describe('resolveProviderOptionsKey', () => {
  it('should return camelCase key when camelCase options are present', () => {
    expect(
      resolveProviderOptionsKey('provider-name', {
        providerName: { someOption: 'value' },
      }),
    ).toBe('providerName');
  });

  it('should return raw key when only raw options are present', () => {
    expect(
      resolveProviderOptionsKey('provider-name', {
        'provider-name': { someOption: 'value' },
      }),
    ).toBe('provider-name');
  });

  it('should return camelCase key when both are present', () => {
    expect(
      resolveProviderOptionsKey('provider-name', {
        'provider-name': { a: 1 },
        providerName: { b: 2 },
      }),
    ).toBe('providerName');
  });

  it('should return raw key when no options are present', () => {
    expect(resolveProviderOptionsKey('provider-name', {})).toBe(
      'provider-name',
    );
  });

  it('should return raw key when providerOptions is undefined', () => {
    expect(resolveProviderOptionsKey('provider-name', undefined)).toBe(
      'provider-name',
    );
  });

  it('should return raw key when name has no separators', () => {
    expect(resolveProviderOptionsKey('openai', { openai: { a: 1 } })).toBe(
      'openai',
    );
  });
});
