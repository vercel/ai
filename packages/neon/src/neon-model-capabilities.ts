export type NeonModelFamily =
  | 'anthropic'
  | 'google'
  | 'openai'
  | 'meta'
  | 'other';

export interface NeonModelCapabilities {
  family: NeonModelFamily;
  supportsTemperature: boolean;
  supportsTopP: boolean;
  /**
   * Whether `temperature` and `topP` may be sent together. Anthropic models
   * accept only one of the two.
   */
  temperatureTopPMutuallyExclusive: boolean;
  supportsPenalties: boolean;
  supportsSeed: boolean;
  supportsStopSequences: boolean;
  supportsReasoningEffort: boolean;
}

const PERMISSIVE: Omit<NeonModelCapabilities, 'family'> = {
  supportsTemperature: true,
  supportsTopP: true,
  temperatureTopPMutuallyExclusive: false,
  supportsPenalties: true,
  supportsSeed: true,
  supportsStopSequences: true,
  supportsReasoningEffort: true,
};

/**
 * Heuristic, prefix-based capability detection for Neon AI Gateway models.
 *
 * The gateway proxies to heterogeneous upstream providers, each of which accepts
 * a different subset of the OpenAI-style parameters the AI SDK emits. Sending a
 * parameter an upstream rejects results in a hard `400`, so we strip the
 * parameters a family is known to reject and surface a warning instead.
 *
 * We only restrict parameters for families where the gateway has been observed
 * to reject them; unknown/untested models stay permissive (passed through
 * unchanged) to avoid silently dropping parameters a model actually supports.
 */
export function getNeonModelCapabilities(
  modelId: string,
): NeonModelCapabilities {
  const id = modelId.toLowerCase();

  // Anthropic (Claude): rejects penalties and seed, accepts only one of
  // temperature/topP, and rejects the OpenAI `reasoning_effort` field.
  if (id.includes('claude')) {
    return {
      family: 'anthropic',
      supportsTemperature: true,
      supportsTopP: true,
      temperatureTopPMutuallyExclusive: true,
      supportsPenalties: false,
      supportsSeed: false,
      supportsStopSequences: true,
      supportsReasoningEffort: false,
    };
  }

  // Google (Gemini): accepts standard sampling params but rejects the OpenAI
  // `reasoning_effort` field (not part of Gemini's generation config).
  if (id.includes('gemini')) {
    return { family: 'google', ...PERMISSIVE, supportsReasoningEffort: false };
  }

  // OpenAI GPT-5 reasoning family: rejects penalties and stop. The original
  // gpt-5 / gpt-5-mini / gpt-5-nano also require the default temperature and
  // reject topP; gpt-5.1+ (a minor version digit follows) accept them again.
  if (/gpt-5/.test(id)) {
    const hasMinorVersion = /gpt-5[.-]\d/.test(id);
    return {
      family: 'openai',
      supportsTemperature: hasMinorVersion,
      supportsTopP: hasMinorVersion,
      temperatureTopPMutuallyExclusive: false,
      supportsPenalties: false,
      supportsSeed: true,
      supportsStopSequences: false,
      supportsReasoningEffort: true,
    };
  }

  // Meta (Llama): rejects penalties and seed; accepts sampling params and stop.
  if (id.includes('llama')) {
    return {
      family: 'meta',
      supportsTemperature: true,
      supportsTopP: true,
      temperatureTopPMutuallyExclusive: false,
      supportsPenalties: false,
      supportsSeed: false,
      supportsStopSequences: true,
      supportsReasoningEffort: true,
    };
  }

  return { family: 'other', ...PERMISSIVE };
}
