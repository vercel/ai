import { prepareCallSettings } from '../prompt/prepare-call-settings';
import type { PrepareStepCallSettings } from './prepare-step';

/**
 * Resolves model call settings for a single step.
 *
 * Undefined step settings intentionally fall back to the outer call settings,
 * while defined falsy values such as `temperature: 0` and `seed: 0` are kept.
 */
export function prepareStepCallSettings({
  callSettings,
  stepSettings,
}: {
  callSettings: PrepareStepCallSettings;
  stepSettings: PrepareStepCallSettings | undefined;
}): PrepareStepCallSettings {
  return prepareCallSettings({
    maxOutputTokens:
      stepSettings?.maxOutputTokens ?? callSettings.maxOutputTokens,
    temperature: stepSettings?.temperature ?? callSettings.temperature,
    topP: stepSettings?.topP ?? callSettings.topP,
    topK: stepSettings?.topK ?? callSettings.topK,
    presencePenalty:
      stepSettings?.presencePenalty ?? callSettings.presencePenalty,
    frequencyPenalty:
      stepSettings?.frequencyPenalty ?? callSettings.frequencyPenalty,
    stopSequences: stepSettings?.stopSequences ?? callSettings.stopSequences,
    seed: stepSettings?.seed ?? callSettings.seed,
  });
}
