import { CallSettings } from '../prompt/call-settings';
import { experimental_ProviderRegistry } from '../registry';
import { Blueprint, createBlueprint } from './blueprint';
import Mustache from 'mustache';

export type SerializedBlueprint = {
  model?: string;
  system?: string; // mustache template
  prompt?: string; // mustache template
  // TODO figure out how to serialize messages in a templated form
} & Omit<CallSettings, 'abortSignal' | 'maxRetries'>;

export function loadSerializedBlueprint<T = any>({
  registry,
  blueprint,
}: {
  registry?: experimental_ProviderRegistry;
  blueprint: SerializedBlueprint;
  // TODO should there be an optional input schema?
}): Blueprint<T> {
  if (blueprint.model != null && registry == null) {
    // TODO dedicated error type
    throw new Error('registry is required if model is provided');
  }

  const model =
    blueprint.model != null
      ? registry?.languageModel(blueprint.model)
      : undefined;

  const system =
    blueprint.system != null
      ? (input: T) => Mustache.render(blueprint.system!, input)
      : undefined;

  const prompt =
    blueprint.prompt != null
      ? (input: T) => Mustache.render(blueprint.prompt!, input)
      : undefined;

  return createBlueprint(async (input: T) => ({
    // model:
    model,

    // settings:
    maxTokens: blueprint.maxTokens,
    temperature: blueprint.temperature,
    topP: blueprint.topP,
    presencePenalty: blueprint.presencePenalty,
    frequencyPenalty: blueprint.frequencyPenalty,
    seed: blueprint.seed,

    // prompt:
    system: system?.(input),
    prompt: prompt?.(input),
  }));
}
