import { describe, it, expect } from 'vitest';
import { getProviderMetadata } from './get-provider-metadata';

describe('getProviderMetadata', () => {
  describe('provider-specific metadata', () => {
    it('should extract provider-specific metadata when available', () => {
      const result = getProviderMetadata(
        {
          providerOptions: {
            openai: {
              user: 'test-user',
              customOption: 'value',
            },
          },
        },
        'openai',
      );

      expect(result).toEqual({
        user: 'test-user',
        customOption: 'value',
      });
    });

    it('should return empty object when no metadata exists', () => {
      const result = getProviderMetadata({}, 'openai');

      expect(result).toEqual({});
    });

    it('should return empty object when providerOptions is undefined', () => {
      const result = getProviderMetadata(
        { providerOptions: undefined },
        'openai',
      );

      expect(result).toEqual({});
    });

    it('should return empty object when provider name does not match', () => {
      const result = getProviderMetadata(
        {
          providerOptions: {
            anthropic: {
              user: 'test-user',
            },
          },
        },
        'openai',
      );

      expect(result).toEqual({});
    });
  });

  describe('backwards compatibility with openaiCompatible', () => {
    it('should fall back to openaiCompatible when provider-specific metadata is not available', () => {
      const result = getProviderMetadata(
        {
          providerOptions: {
            openaiCompatible: {
              user: 'legacy-user',
              cacheControl: { type: 'ephemeral' },
            },
          },
        },
        'openai',
      );

      expect(result).toEqual({
        user: 'legacy-user',
        cacheControl: { type: 'ephemeral' },
      });
    });

    it('should prioritize provider-specific metadata over openaiCompatible', () => {
      const result = getProviderMetadata(
        {
          providerOptions: {
            openai: {
              user: 'new-user',
            },
            openaiCompatible: {
              user: 'legacy-user',
              otherOption: 'value',
            },
          },
        },
        'openai',
      );

      expect(result).toEqual({
        user: 'new-user',
        otherOption: 'value',
      });
    });

    it('should merge provider-specific and openaiCompatible metadata', () => {
      const result = getProviderMetadata(
        {
          providerOptions: {
            openai: {
              newOption: 'new-value',
              sharedOption: 'provider-value',
            },
            openaiCompatible: {
              legacyOption: 'legacy-value',
              sharedOption: 'legacy-value',
            },
          },
        },
        'openai',
      );

      expect(result).toEqual({
        newOption: 'new-value',
        legacyOption: 'legacy-value',
        sharedOption: 'provider-value',
      });
    });
  });

  describe('complex metadata structures', () => {
    it('should handle nested objects', () => {
      const result = getProviderMetadata(
        {
          providerOptions: {
            openai: {
              nested: {
                deep: {
                  value: 'test',
                },
              },
            },
          },
        },
        'openai',
      );

      expect(result).toEqual({
        nested: {
          deep: {
            value: 'test',
          },
        },
      });
    });

    it('should handle arrays in metadata', () => {
      const result = getProviderMetadata(
        {
          providerOptions: {
            openai: {
              tags: ['tag1', 'tag2'],
            },
          },
        },
        'openai',
      );

      expect(result).toEqual({
        tags: ['tag1', 'tag2'],
      });
    });
  });
});
