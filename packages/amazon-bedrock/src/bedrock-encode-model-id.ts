/**
 * Encodes a Bedrock model identifier for use in URL path segments.
 *
 * ARNs (e.g. inference-profile ARNs) must be kept unencoded because the
 * Bedrock REST API expects the literal ARN in the path. Regular model IDs
 * are percent-encoded as before so that characters like `:` are escaped.
 */
export function bedrockEncodeModelId(modelId: string): string {
  if (modelId.startsWith('arn:')) {
    return modelId;
  }
  return encodeURIComponent(modelId);
}
