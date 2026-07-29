import type { CallSettings } from '../prompt/call-settings';
import { prepareCallSettings } from '../prompt/prepare-call-settings';

type ModelCallSettings = Omit<
  CallSettings,
  'maxRetries' | 'abortSignal' | 'headers'
>;

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
  callSettings: ModelCallSettings;
  stepSettings: ModelCallSettings | undefined;
}): ModelCallSettings {
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
