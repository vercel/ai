import { getModelCapabilities } from '@ai-sdk/provider-utils';
import type { KnownModelId } from '@ai-sdk/provider-utils/test';
import { describe, expect, expectTypeOf, it } from 'vitest';
import type { GoogleModelId } from './google-language-model-options';
import { googleLanguageModelCatalog } from './google-model-catalog';

// Must contain exactly the model IDs of `GoogleModelId`. Type checking fails
// when an ID is missing or not part of the type.
const modelIds = [
  'gemini-2.0-flash',
  'gemini-2.0-flash-001',
  'gemini-2.0-flash-lite',
  'gemini-2.0-flash-lite-001',
  'gemini-2.5-pro',
  'gemini-2.5-flash',
  'gemini-2.5-flash-image',
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash-preview-tts',
  'gemini-2.5-pro-preview-tts',
  'gemini-2.5-flash-native-audio-latest',
  'gemini-2.5-flash-native-audio-preview-09-2025',
  'gemini-2.5-flash-native-audio-preview-12-2025',
  'gemini-2.5-computer-use-preview-10-2025',
  'gemini-3-pro-preview',
  'gemini-3-pro-image-preview',
  'gemini-3-flash-preview',
  'gemini-3.1-pro-preview',
  'gemini-3.1-pro-preview-customtools',
  'gemini-3.1-flash-image-preview',
  'gemini-3.1-flash-lite-preview',
  'gemini-3.1-flash-tts-preview',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.6-flash',
  'gemini-3.7-flash',
  'gemini-3.8-flash',
  'gemini-4-argon',
  'gemini-nano-banana-2.1',
  'gemini-pro-latest',
  'gemini-flash-latest',
  'gemini-flash-lite-latest',
  'deep-research-pro-preview-12-2025',
  'deep-research-max-preview-04-2026',
  'deep-research-preview-04-2026',
  'nano-banana-pro-preview',
  'aqa',
  'gemini-robotics-er-1.5-preview',
  'gemma-3-1b-it',
  'gemma-3-4b-it',
  'gemma-3n-e4b-it',
  'gemma-3n-e2b-it',
  'gemma-3-12b-it',
  'gemma-3-27b-it',
] as const satisfies readonly KnownModelId<GoogleModelId>[];
expectTypeOf<
  Exclude<KnownModelId<GoogleModelId>, (typeof modelIds)[number]>
>().toBeNever();

const get = (modelId: string) =>
  getModelCapabilities(googleLanguageModelCatalog, modelId);

describe('googleLanguageModelCatalog', () => {
  it.each(modelIds)('knows %s', modelId => {
    expect(get(modelId).isKnownModel).toBe(true);
  });

  it('resolves the capabilities of every model ID', () => {
    expect(
      Object.fromEntries(
        modelIds.map(modelId => [modelId, get(modelId).capabilities]),
      ),
    ).toMatchSnapshot();
  });

  it('resolves model IDs that are not listed', () => {
    expect(
      Object.fromEntries(
        [
          // Prefixed model IDs:
          'models/gemini-2.5-flash',
          'publishers/google/models/gemini-2.5-flash',
          'eu.gemini-2.5-flash',
          'au.gemini-3.5-flash',
          'GEMINI-2.5-PRO',
          'models/gemma-3-27b-it',
          // Model families:
          'gemini-pro',
          'gemini-pro-vision',
          'gemini-robotics-er-1.5-preview',
          'gemini-2.5-flash-preview-09-2025',
          'gemini-2.0-flash-001',
          'gemini-99-pro-preview',
          'gemini-ultra-latest',
          'nano-banana-pro-preview',
          // Unknown models:
          'tunedModels/my-model',
        ].map(modelId => [modelId, get(modelId)]),
      ),
    ).toMatchSnapshot();
  });
});
