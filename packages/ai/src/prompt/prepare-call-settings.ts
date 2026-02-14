import { InvalidArgumentError } from '../error/invalid-argument-error';
import { CallSettings } from './call-settings';

/**
 * Validates call settings and returns a new object with limited values.
 */
export function prepareCallSettings({
  maxOutputTokens,
  temperature,
  topP,
  topK,
  presencePenalty,
  frequencyPenalty,
  seed,
  stopSequences,
  thinking,
}: Omit<CallSettings, 'abortSignal' | 'headers' | 'maxRetries'>): Omit<
  CallSettings,
  'abortSignal' | 'headers' | 'maxRetries'
> {
  if (maxOutputTokens != null) {
    if (!Number.isInteger(maxOutputTokens)) {
      throw new InvalidArgumentError({
        parameter: 'maxOutputTokens',
        value: maxOutputTokens,
        message: 'maxOutputTokens must be an integer',
      });
    }

    if (maxOutputTokens < 1) {
      throw new InvalidArgumentError({
        parameter: 'maxOutputTokens',
        value: maxOutputTokens,
        message: 'maxOutputTokens must be >= 1',
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
  }

  if (topP != null) {
    if (typeof topP !== 'number') {
      throw new InvalidArgumentError({
        parameter: 'topP',
        value: topP,
        message: 'topP must be a number',
      });
    }
  }

  if (topK != null) {
    if (typeof topK !== 'number') {
      throw new InvalidArgumentError({
        parameter: 'topK',
        value: topK,
        message: 'topK must be a number',
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
  }

  if (frequencyPenalty != null) {
    if (typeof frequencyPenalty !== 'number') {
      throw new InvalidArgumentError({
        parameter: 'frequencyPenalty',
        value: frequencyPenalty,
        message: 'frequencyPenalty must be a number',
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

  if (thinking != null) {
    if (typeof thinking !== 'object' || Array.isArray(thinking)) {
      throw new InvalidArgumentError({
        parameter: 'thinking',
        value: thinking,
        message: 'thinking must be an object',
      });
    }

    const thinkingType = thinking.type;
    if (thinkingType !== 'enabled' && thinkingType !== 'disabled') {
      throw new InvalidArgumentError({
        parameter: 'thinking.type',
        value: thinkingType,
        message: 'thinking.type must be "enabled" or "disabled"',
      });
    }

    const effort = (thinking as { effort?: unknown }).effort;
    const budgetTokens = (thinking as { budgetTokens?: unknown }).budgetTokens;

    if (thinkingType === 'enabled') {
      if (
        effort != null &&
        effort !== 'low' &&
        effort !== 'medium' &&
        effort !== 'high'
      ) {
        throw new InvalidArgumentError({
          parameter: 'thinking.effort',
          value: effort,
          message: 'thinking.effort must be "low", "medium", or "high"',
        });
      }

      if (budgetTokens != null) {
        if (
          typeof budgetTokens !== 'number' ||
          !Number.isInteger(budgetTokens) ||
          budgetTokens < 1
        ) {
          throw new InvalidArgumentError({
            parameter: 'thinking.budgetTokens',
            value: budgetTokens,
            message: 'thinking.budgetTokens must be an integer >= 1',
          });
        }
      }
    } else {
      if (effort != null) {
        throw new InvalidArgumentError({
          parameter: 'thinking.effort',
          value: effort,
          message:
            'thinking.effort can only be set when thinking.type is "enabled"',
        });
      }

      if (budgetTokens != null) {
        throw new InvalidArgumentError({
          parameter: 'thinking.budgetTokens',
          value: budgetTokens,
          message:
            'thinking.budgetTokens can only be set when thinking.type is "enabled"',
        });
      }
    }
  }

  return {
    maxOutputTokens,
    temperature,
    topP,
    topK,
    presencePenalty,
    frequencyPenalty,
    stopSequences,
    seed,
    ...(thinking != null && { thinking }),
  };
}
