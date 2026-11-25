import { describe, expect, it } from 'vitest';
import { getGoogleModelCapabilities } from './google-model-capabilities';

describe('getGoogleModelCapabilities', () => {
  it.each([
    {
      modelId: 'gemini-pro',
      expected: {
        supportsProviderTools: false,
        supportsFileSearch: false,
        supportsMixedTools: false,
      },
    },
    {
      modelId: 'gemini-pro-vision',
      expected: {
        supportsProviderTools: false,
        supportsFileSearch: false,
        supportsMixedTools: false,
      },
    },
    {
      modelId: 'gemini-1.5-flash',
      expected: {
        supportsProviderTools: false,
        supportsFileSearch: false,
        supportsMixedTools: false,
      },
    },
    {
      modelId: 'gemini-robotics-er-1.5-preview',
      expected: {
        supportsProviderTools: false,
        supportsFileSearch: false,
        supportsMixedTools: false,
      },
    },
    {
      modelId: 'gemini-2.0-flash',
      expected: {
        supportsProviderTools: true,
        supportsFileSearch: false,
        supportsMixedTools: false,
      },
    },
    {
      modelId: 'gemini-2.5-flash',
      expected: {
        supportsProviderTools: true,
        supportsFileSearch: true,
        supportsMixedTools: false,
      },
    },
    {
      modelId: 'eu.gemini-2.5-flash',
      expected: {
        supportsProviderTools: true,
        supportsFileSearch: true,
        supportsMixedTools: false,
      },
    },
    {
      modelId: 'gemini-3.1-pro-preview',
      expected: {
        supportsProviderTools: true,
        supportsFileSearch: true,
        supportsMixedTools: true,
      },
    },
    {
      modelId: 'au.gemini-3.5-flash',
      expected: {
        supportsProviderTools: true,
        supportsFileSearch: true,
        supportsMixedTools: true,
      },
    },
    {
      // Use a deliberately distant generation so this remains an unknown
      // future-model fixture as new Gemini generations are released.
      modelId: 'gemini-99-pro-preview',
      expected: {
        supportsProviderTools: true,
        supportsFileSearch: true,
        supportsMixedTools: true,
      },
    },
    {
      modelId: 'gemini-ultra-latest',
      expected: {
        supportsProviderTools: true,
        supportsFileSearch: true,
        supportsMixedTools: true,
      },
    },
    {
      modelId: 'nano-banana-pro-preview',
      expected: {
        supportsProviderTools: true,
        supportsFileSearch: false,
        supportsMixedTools: false,
      },
    },
  ])(
    'classifies $modelId without falling back to legacy behavior',
    ({ modelId, expected }) => {
      expect(getGoogleModelCapabilities(modelId)).toEqual(expected);
    },
  );
});
