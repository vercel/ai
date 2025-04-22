import { prepareCallSettings } from './prepare-call-settings';

describe('prepareCallSettings', () => {
  it('should pass through all provided values and set defaults correctly', () => {
    const input = {
      maxOutputTokens: 100,
      temperature: 0.7,
      topP: 0.9,
      topK: 50,
      presencePenalty: 0.5,
      frequencyPenalty: 0.3,
      stopSequences: ['stop1', 'stop2'],
      seed: 42,
    };

    const result = prepareCallSettings(input);
    expect(result).toEqual({
      maxOutputTokens: 100,
      temperature: 0.7,
      topP: 0.9,
      topK: 50,
      presencePenalty: 0.5,
      frequencyPenalty: 0.3,
      stopSequences: ['stop1', 'stop2'],
      seed: 42,
    });
  });

  describe("should set temperature to 0 when it's not provided", () => {
    it('when it is null', () => {
      const result = prepareCallSettings({});
      expect(result.temperature).toEqual(0);
    });
  });

  describe("should set temperature to undefined when it's null", () => {
    it('when it is null', () => {
      const result = prepareCallSettings({ temperature: null });
      expect(result.temperature).toEqual(undefined);
    });
  });

  it('it should remove stopSequences when it is an empty array', () => {
    const result = prepareCallSettings({ stopSequences: [] });
    expect(result.stopSequences).toEqual(undefined);
  });
});
