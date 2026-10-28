/**
 * The grok-4.20 reasoning and non-reasoning models (including dated variants
 * such as `grok-4.20-0309-reasoning`) reject the reasoning effort parameter
 * with an invalid-argument error for every value, including `none`.
 * Other models such as `grok-4.3`, `grok-latest`, and
 * `grok-4.20-multi-agent` accept it.
 */
const modelsWithoutReasoningEffort = /^grok-4\.20(-\d{4})?-(non-)?reasoning$/;

export function supportsReasoningEffort(modelId: string): boolean {
  return !modelsWithoutReasoningEffort.test(modelId);
}

/**
 * grok-4.5 and later reject the reasoning effort `none` because their
 * reasoning cannot be disabled. grok-4.20 is an earlier release than grok-4.5
 * despite its version number, and accepts `none`.
 */
const modelsWithoutNoneReasoningEffort =
  /^grok-(?:4\.[5-9](?!\d)|(?:[5-9]|[1-9]\d+)(?:[.-]|$))/;

export function supportsNoneReasoningEffort(modelId: string): boolean {
  return !modelsWithoutNoneReasoningEffort.test(modelId);
}
