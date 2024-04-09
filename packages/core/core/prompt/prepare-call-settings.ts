import { InvalidArgumentError } from '@ai-sdk/provider';
import { CallSettings } from './call-settings';

/**
 * Validates call settings and sets default values.
 */
export function prepareCallSettings({
  maxTokens,
  temperature,
  topP,
  presencePenalty,
  frequencyPenalty,
  seed,
  maxRetries,
}: CallSettings): CallSettings {
  if (maxTokens != null) {
    if (!Number.isInteger(maxTokens)) {
      throw new InvalidArgumentError({
        parameter: 'maxTokens',
        value: maxTokens,
        message: 'maxTokens must be an integer',
      });
    }

    if (maxTokens < 1) {
      throw new InvalidArgumentError({
        parameter: 'maxTokens',
        value: maxTokens,
        message: 'maxTokens must be >= 1',
      });
    }
  }

  if (temperature != null) {
    if (typeof temperature !== 'number') {
      throw new InvalidArgumentError({
        parameter: 'temperature',
        value: temperature,
        message: 'temperature must be a number',
      });
    }

    if (temperature < 0 || temperature > 1) {
      throw new InvalidArgumentError({
        parameter: 'temperature',
        value: temperature,
        message: 'temperature must be between 0 and 1 (inclusive)',
      });
    }
  }

  if (topP != null) {
    if (typeof topP !== 'number') {
      throw new InvalidArgumentError({
        parameter: 'topP',
        value: topP,
        message: 'topP must be a number',
      });
    }

    if (topP < 0 || topP > 1) {
      throw new InvalidArgumentError({
        parameter: 'topP',
        value: topP,
        message: 'topP must be between 0 and 1 (inclusive)',
      });
    }
  }

  if (presencePenalty != null) {
    if (typeof presencePenalty !== 'number') {
      throw new InvalidArgumentError({
        parameter: 'presencePenalty',
        value: presencePenalty,
        message: 'presencePenalty must be a number',
      });
    }

    if (presencePenalty < -1 || presencePenalty > 1) {
      throw new InvalidArgumentError({
        parameter: 'presencePenalty',
        value: presencePenalty,
        message: 'presencePenalty must be between -1 and 1 (inclusive)',
      });
    }
  }

  if (frequencyPenalty != null) {
    if (typeof frequencyPenalty !== 'number') {
      throw new InvalidArgumentError({
        parameter: 'frequencyPenalty',
        value: frequencyPenalty,
        message: 'frequencyPenalty must be a number',
      });
    }

    if (frequencyPenalty < -1 || frequencyPenalty > 1) {
      throw new InvalidArgumentError({
        parameter: 'frequencyPenalty',
        value: frequencyPenalty,
        message: 'frequencyPenalty must be between -1 and 1 (inclusive)',
      });
    }
  }

  if (seed != null) {
    if (!Number.isInteger(seed)) {
      throw new InvalidArgumentError({
        parameter: 'seed',
        value: seed,
        message: 'seed must be an integer',
      });
    }
  }

  if (maxRetries != null) {
    if (!Number.isInteger(maxRetries)) {
      throw new InvalidArgumentError({
        parameter: 'maxRetries',
        value: maxRetries,
        message: 'maxRetries must be an integer',
      });
    }

    if (maxRetries < 0) {
      throw new InvalidArgumentError({
        parameter: 'maxRetries',
        value: maxRetries,
        message: 'maxRetries must be >= 0',
      });
    }
  }

  return {
    maxTokens,
    temperature: temperature ?? 0,
    topP,
    presencePenalty: presencePenalty ?? 0,
    frequencyPenalty: frequencyPenalty ?? 0,
    seed,
    maxRetries: maxRetries ?? 2,
  };
}
