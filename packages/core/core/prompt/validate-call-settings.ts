import { CallSettings } from './call-settings';
import { AI_InvalidArgumentError } from '../../ai-model-specification';

export function validateCallSettings(settings: CallSettings): CallSettings {
  if (settings.maxTokens != null) {
    if (!Number.isInteger(settings.maxTokens)) {
      throw new AI_InvalidArgumentError({
        parameter: 'maxTokens',
        value: settings.maxTokens,
        message: 'maxTokens must be an integer',
      });
    }

    if (settings.maxTokens < 1) {
      throw new AI_InvalidArgumentError({
        parameter: 'maxTokens',
        value: settings.maxTokens,
        message: 'maxTokens must be >= 1',
      });
    }
  }

  if (settings.temperature != null) {
    if (typeof settings.temperature !== 'number') {
      throw new AI_InvalidArgumentError({
        parameter: 'temperature',
        value: settings.temperature,
        message: 'temperature must be a number',
      });
    }

    if (settings.temperature < 0 || settings.temperature > 1) {
      throw new AI_InvalidArgumentError({
        parameter: 'temperature',
        value: settings.temperature,
        message: 'temperature must be between 0 and 1 (inclusive)',
      });
    }
  }

  if (settings.topP != null) {
    if (typeof settings.topP !== 'number') {
      throw new AI_InvalidArgumentError({
        parameter: 'topP',
        value: settings.topP,
        message: 'topP must be a number',
      });
    }

    if (settings.topP < 0 || settings.topP > 1) {
      throw new AI_InvalidArgumentError({
        parameter: 'topP',
        value: settings.topP,
        message: 'topP must be between 0 and 1 (inclusive)',
      });
    }
  }

  if (settings.presencePenalty != null) {
    if (typeof settings.presencePenalty !== 'number') {
      throw new AI_InvalidArgumentError({
        parameter: 'presencePenalty',
        value: settings.presencePenalty,
        message: 'presencePenalty must be a number',
      });
    }

    if (settings.presencePenalty < -1 || settings.presencePenalty > 1) {
      throw new AI_InvalidArgumentError({
        parameter: 'presencePenalty',
        value: settings.presencePenalty,
        message: 'presencePenalty must be between -1 and 1 (inclusive)',
      });
    }
  }

  if (settings.frequencyPenalty != null) {
    if (typeof settings.frequencyPenalty !== 'number') {
      throw new AI_InvalidArgumentError({
        parameter: 'frequencyPenalty',
        value: settings.frequencyPenalty,
        message: 'frequencyPenalty must be a number',
      });
    }

    if (settings.frequencyPenalty < -1 || settings.frequencyPenalty > 1) {
      throw new AI_InvalidArgumentError({
        parameter: 'frequencyPenalty',
        value: settings.frequencyPenalty,
        message: 'frequencyPenalty must be between -1 and 1 (inclusive)',
      });
    }
  }

  if (settings.seed != null) {
    if (!Number.isInteger(settings.seed)) {
      throw new AI_InvalidArgumentError({
        parameter: 'seed',
        value: settings.seed,
        message: 'seed must be an integer',
      });
    }
  }

  return settings;
}
