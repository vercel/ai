import { describe, expect, it } from 'vitest';
import { prepareStepCallSettings } from './prepare-step-call-settings';

describe('prepareStepCallSettings', () => {
  const outerSettings = {
    maxOutputTokens: 100,
    temperature: 1,
    topP: 0.9,
    topK: 40,
    presencePenalty: 0.4,
    frequencyPenalty: 0.3,
    stopSequences: ['outer'],
    seed: 123,
  };

  it('preserves defined falsy overrides and falls back for undefined values', () => {
    expect(
      prepareStepCallSettings({
        callSettings: outerSettings,
        stepSettings: {
          maxOutputTokens: 50,
          temperature: 0,
          topP: 0.5,
          topK: 10,
          presencePenalty: 0,
          frequencyPenalty: -0.2,
          stopSequences: [],
          seed: 0,
        },
      }),
    ).toEqual({
      maxOutputTokens: 50,
      temperature: 0,
      topP: 0.5,
      topK: 10,
      presencePenalty: 0,
      frequencyPenalty: -0.2,
      stopSequences: [],
      seed: 0,
    });

    expect(
      prepareStepCallSettings({
        callSettings: outerSettings,
        stepSettings: { temperature: undefined },
      }),
    ).toEqual(outerSettings);
  });

  it('validates step overrides', () => {
    expect(() =>
      prepareStepCallSettings({
        callSettings: outerSettings,
        stepSettings: { maxOutputTokens: 0 },
      }),
    ).toThrow('maxOutputTokens must be >= 1');
  });
});
