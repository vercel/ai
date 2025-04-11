import { expect, it } from 'vitest';
import { prepareCallSettings } from './prepare-call-settings';

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
