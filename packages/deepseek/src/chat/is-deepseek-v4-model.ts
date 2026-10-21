/**
 * Whether a model id uses DeepSeek V4-or-newer behavior (thinking mode on by
 * default, `reasoning_content` required on every assistant turn).
 *
 * DeepSeek publishes V4 models under both versioned ids (`deepseek-v4-pro`,
 * `deepseek-v4-flash-*`) and unversioned aliases (`deepseek-flash`, currently
 * serving V4.1 Flash). Known legacy aliases and pre-V4 version IDs retain
 * their previous behavior; unrecognized IDs inherit the current protocol.
 */
export function isDeepSeekV4Model(modelId: string): boolean {
  return !/(^|[/.])deepseek-(?:chat|reasoner|v[1-3](?:\.\d+)?)(?=[-/:.]|$)/.test(
    modelId,
  );
}
