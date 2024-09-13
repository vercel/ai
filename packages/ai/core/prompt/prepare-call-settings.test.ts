import { expect, it } from 'vitest';
import { prepareCallSettings } from './prepare-call-settings';

it('should pass through all provided values and set defaults correctly', () => {
  const input = {
    maxTokens: 100,
    temperature: 0.7,
    topP: 0.9,
    topK: 50,
    presencePenalty: 0.5,
    frequencyPenalty: 0.3,
    stopSequences: ['stop1', 'stop2'],
    seed: 42,
    maxRetries: 3,
  };

  const result = prepareCallSettings(input);
  expect(result).toEqual({
    maxTokens: 100,
    temperature: 0.7,
    topP: 0.9,
    topK: 50,
    presencePenalty: 0.5,
    frequencyPenalty: 0.3,
    stopSequences: ['stop1', 'stop2'],
    seed: 42,
    maxRetries: 3,
  });
});

it('should set default values correctly when no input is provided', () => {
  const defaultResult = prepareCallSettings({});
  expect(defaultResult.temperature).toBe(0);
  expect(defaultResult.maxRetries).toBe(2);
  expect(defaultResult.stopSequences).toBeUndefined();
});
