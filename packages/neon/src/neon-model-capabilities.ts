export type NeonModelFamily =
  | 'anthropic'
  | 'google'
  | 'openai'
  | 'meta'
  | 'other';

/**
 * Which gateway endpoint a model should be routed to.
 *
 * - `anthropic`: native Messages API — unlocks streaming structured output and
 *   native reasoning for Claude models.
 * - `openai`: native Responses API — unlocks models served only natively (e.g.
 *   Codex) plus native reasoning and the image-generation tool.
 * - `mlflow`: the unified, OpenAI-compatible endpoint (the fallback). Gemini is
 *   routed here because the gateway's native Gemini endpoint does not support
 *   streaming (`streamGenerateContent` is rejected), whereas the unified
 *   endpoint streams Gemini responses normally.
 */
export type NeonModelRoute = 'anthropic' | 'openai' | 'mlflow';

export function getNeonModelRoute(modelId: string): NeonModelRoute {
  const id = modelId.toLowerCase();
  if (id.includes('claude')) {
    return 'anthropic';
  }
  // OpenAI proprietary models (gpt-4/gpt-5 families, Codex) are served only via
  // the native Responses API. `gpt-oss` is open-weight and served on the
  // unified chat endpoint, so it is intentionally excluded here.
  if (
    (id.includes('gpt-') && !id.includes('gpt-oss')) ||
    id.includes('codex')
  ) {
    return 'openai';
  }
  return 'mlflow';
}

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

  // OpenAI GPT-5 reasoning family (routed to the native Responses API). The
  // Responses model already strips parameters the Responses API doesn't accept
  // (penalties, seed, stop), but its reasoning-model detection matches the bare
  // model id (`gpt-5`), which the gateway's `databricks-` prefix defeats. So we
  // only need to handle the temperature/topP restriction here: the original
  // gpt-5 / gpt-5-mini / gpt-5-nano require the default temperature and reject
  // topP, while gpt-5.1+ (a minor version digit follows) accept them again.
  if (/gpt-5/.test(id)) {
    const hasMinorVersion = /gpt-5[.-]\d/.test(id);
    return {
      family: 'openai',
      supportsTemperature: hasMinorVersion,
      supportsTopP: hasMinorVersion,
      temperatureTopPMutuallyExclusive: false,
      supportsPenalties: true,
      supportsSeed: true,
      supportsStopSequences: true,
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
