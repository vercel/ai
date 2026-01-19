// https://docs.aws.amazon.com/bedrock/latest/userguide/models-supported.html
// Anthropic Claude models available on Amazon Bedrock
export type BedrockAnthropicModelId =
  // Claude 4.x models
  | 'anthropic.claude-opus-4-1-20250805-v1:0'
  | 'anthropic.claude-sonnet-4-5-20250929-v1:0'
  | 'anthropic.claude-opus-4-5-20251101-v1:0'
  | 'anthropic.claude-haiku-4-5-20251101-v1:0'
  // Claude 3.7 models
  | 'anthropic.claude-3-7-sonnet-20250219-v1:0'
  // Claude 3.5 models
  | 'anthropic.claude-3-5-sonnet-20241022-v2:0'
  | 'anthropic.claude-3-5-sonnet-20240620-v1:0'
  | 'anthropic.claude-3-5-haiku-20241022-v1:0'
  // Claude 3 models
  | 'anthropic.claude-3-opus-20240229-v1:0'
  | 'anthropic.claude-3-sonnet-20240229-v1:0'
  | 'anthropic.claude-3-haiku-20240307-v1:0'
  // Inference profile variants (us. prefix)
  | 'us.anthropic.claude-opus-4-1-20250805-v1:0'
  | 'us.anthropic.claude-sonnet-4-5-20250929-v1:0'
  | 'us.anthropic.claude-opus-4-5-20251101-v1:0'
  | 'us.anthropic.claude-haiku-4-5-20251101-v1:0'
  | 'us.anthropic.claude-3-7-sonnet-20250219-v1:0'
  | 'us.anthropic.claude-3-5-sonnet-20241022-v2:0'
  | 'us.anthropic.claude-3-5-sonnet-20240620-v1:0'
  | 'us.anthropic.claude-3-5-haiku-20241022-v1:0'
  | 'us.anthropic.claude-3-opus-20240229-v1:0'
  | 'us.anthropic.claude-3-sonnet-20240229-v1:0'
  | 'us.anthropic.claude-3-haiku-20240307-v1:0'
  // Allow custom model IDs
  | (string & {});
