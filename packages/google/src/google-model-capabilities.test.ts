import { describe, expect, it } from 'vitest';
import { getGoogleModelCapabilities } from './google-model-capabilities';

describe('getGoogleModelCapabilities', () => {
  it.each([
    {
      modelId: 'gemini-pro',
      expected: {
        supportsGemini2Tools: false,
        supportsFileSearch: false,
        usesGemini3Features: false,
      },
    },
    {
      modelId: 'gemini-pro-vision',
      expected: {
        supportsGemini2Tools: false,
        supportsFileSearch: false,
        usesGemini3Features: false,
      },
    },
    {
      modelId: 'gemini-1.5-flash',
      expected: {
        supportsGemini2Tools: false,
        supportsFileSearch: false,
        usesGemini3Features: false,
      },
    },
    {
      modelId: 'gemini-robotics-er-1.5-preview',
      expected: {
        supportsGemini2Tools: false,
        supportsFileSearch: false,
        usesGemini3Features: false,
      },
    },
    {
      modelId: 'gemini-2.0-flash',
      expected: {
        supportsGemini2Tools: true,
        supportsFileSearch: false,
        usesGemini3Features: false,
      },
    },
    {
      modelId: 'gemini-2.5-flash',
      expected: {
        supportsGemini2Tools: true,
        supportsFileSearch: true,
        usesGemini3Features: false,
      },
    },
    {
      modelId: 'gemini-3.1-pro-preview',
      expected: {
        supportsGemini2Tools: true,
        supportsFileSearch: true,
        usesGemini3Features: true,
      },
    },
    {
      // Use a deliberately distant generation so this remains an unknown
      // future-model fixture as new Gemini generations are released.
      modelId: 'gemini-99-pro-preview',
      expected: {
        supportsGemini2Tools: true,
        supportsFileSearch: true,
        usesGemini3Features: true,
      },
    },
    {
      modelId: 'gemini-ultra-latest',
      expected: {
        supportsGemini2Tools: true,
        supportsFileSearch: true,
        usesGemini3Features: true,
      },
    },
    {
      modelId: 'nano-banana-pro-preview',
      expected: {
        supportsGemini2Tools: true,
        supportsFileSearch: false,
        usesGemini3Features: false,
      },
    },
  ])(
    'classifies $modelId without falling back to legacy behavior',
    ({ modelId, expected }) => {
      expect(getGoogleModelCapabilities(modelId)).toEqual(expected);
    },
  );
});
