/**
 * Whether a model id is a DeepSeek V4-generation model (thinking mode on by
 * default, `reasoning_content` required on every assistant turn).
 *
 * DeepSeek publishes V4 models under both versioned ids (`deepseek-v4-pro`,
 * `deepseek-v4-flash-*`) and unversioned aliases (`deepseek-flash`, currently
 * serving V4.1 Flash). Only the legacy `deepseek-chat` / `deepseek-reasoner`
 * ids predate V4.
 */
export function isDeepSeekV4Model(modelId: string): boolean {
  return (
    modelId.includes('deepseek-v4') ||
    modelId.startsWith('deepseek-flash') ||
    modelId.startsWith('deepseek-pro')
  );
}
