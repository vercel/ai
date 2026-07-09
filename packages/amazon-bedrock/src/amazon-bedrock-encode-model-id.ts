/**
 * Encodes a Bedrock model identifier for use in a REST API URL path.
 *
 * Standard model ids (e.g. `us.amazon.nova-2-lite-v1:0`) contain no slashes and
 * are encoded as a single segment. Inference profile ARNs, however, contain a
 * slash (e.g.
 * `arn:aws:bedrock:us-east-1:123456789012:application-inference-profile/abc123`).
 * Bedrock's REST API treats the model id as a greedy path label and expects the
 * slash to stay literal — encoding it to `%2F` (as a plain `encodeURIComponent`
 * would) makes Bedrock reject the request with
 * `400 The provided model identifier is invalid`.
 *
 * Encoding each `/`-separated segment individually keeps slashes literal while
 * still percent-encoding every other special character (such as the `:` in an
 * ARN), matching the path format Bedrock documents for inference profiles.
 */
export function encodeModelId(modelId: string): string {
  return modelId.split('/').map(encodeURIComponent).join('/');
}
