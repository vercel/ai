import { describe, expect, expectTypeOf, it } from 'vitest';
import { googleModelCapabilities } from './index';

describe('googleModelCapabilities', () => {
  it('returns both language endpoints with their own options and capabilities', () => {
    const model = googleModelCapabilities('gemini-2.5-pro')!;
    const { generateContent, interactions } = model.endpoints;

    expect(model.provider).toBe('google');
    expect(Object.keys(model.endpoints)).toEqual([
      'generateContent',
      'interactions',
    ]);
    expect(generateContent!.capabilities.tools.googleSearch).toBe(true);
    expect(generateContent!.capabilities.sampling.penalties).toBe(false);
    expect(generateContent!.providerOptions.labels.support).toBe(false);
    expect(interactions!.providerOptions.labels.support).toBe('unknown');
    expect(interactions!.providerOptions.previousInteractionId).toMatchObject({
      support: 'unknown',
    });
    expect(interactions!.capabilities.sampling.penalties).toBe(false);
    expectTypeOf(generateContent!.providerOptions).not.toHaveProperty(
      'previousInteractionId',
    );
    expectTypeOf(interactions!.providerOptions).not.toHaveProperty(
      'thinkingConfig',
    );
    expectTypeOf(model.endpoints).not.toHaveProperty('messages');
    expect(model).not.toHaveProperty('requestConfig');
  });

  it('does not infer Interactions availability from a Gemini family name', () => {
    expect(
      Object.keys(googleModelCapabilities('gemini-2.0-flash')!.endpoints),
    ).toEqual(['generateContent']);
    expect(
      Object.keys(googleModelCapabilities('lyria-3-clip-preview')!.endpoints),
    ).toEqual(['interactions']);
  });

  it('exposes embedding endpoints without inventing dimensions', () => {
    const model = googleModelCapabilities('gemini-embedding-001')!;
    expect(Object.keys(model.endpoints)).toEqual([
      'embedContent',
      'batchEmbedContents',
    ]);
    expect(model.endpoints.embedContent!.capabilities.customDimensions).toBe(
      'unknown',
    );
    expect(model.endpoints.embedContent!.capabilities).not.toHaveProperty(
      'defaultDimensions',
    );
  });

  it.each([
    ['gemini-3.1-flash-image-preview', 'images'],
    ['veo-3.1-generate', 'videos'],
    ['gemini-3.8-flash-tts', 'speech'],
    ['gemini-3.5-transcribe', 'transcription'],
    ['gemini-3.5-live-translate-preview', 'speechTranslation'],
    ['gemini-decision-1', 'decisions'],
  ])('exposes the declared %s operation', (modelId, endpoint) => {
    expect(googleModelCapabilities(modelId)!.endpoints).toHaveProperty(
      endpoint,
    );
  });

  it.each([
    'custom-model',
    'gemini-future',
    'constructor',
    'toString',
    '__proto__',
  ])('returns undefined for %s', modelId => {
    expect(googleModelCapabilities(modelId)).toBeUndefined();
  });

  it('isolates public mutations from subsequent lookups', () => {
    const model = googleModelCapabilities('gemini-2.5-pro')!;
    (
      model.endpoints.generateContent!.capabilities.inputs as { image: boolean }
    ).image = false;
    expect(
      googleModelCapabilities('gemini-2.5-pro')!.endpoints.generateContent!
        .capabilities.inputs.image,
    ).toBe(true);
  });
});
