/**
 * Encode a Bedrock model identifier for use in REST URL paths.
 *
 * Bedrock inference-profile ARNs (e.g. `arn:aws:bedrock:...:application-inference-profile/abc`)
 * must be passed unencoded — the API rejects URL-escaped colons and slashes with
 * a 400 "The provided model identifier is invalid" error.
 *
 * All other model IDs go through `encodeURIComponent` so version separators
 * (e.g. `nova-2-lite-v1:0`) are escaped.
 */
export function encodeBedrockModelId(modelId: string): string {
  return modelId.startsWith('arn:') ? modelId : encodeURIComponent(modelId);
}
