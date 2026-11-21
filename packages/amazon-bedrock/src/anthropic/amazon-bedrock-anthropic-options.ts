import type { AmazonBedrockModelIds } from '../amazon-bedrock-model-catalog';

export type AmazonBedrockAnthropicModelId =
  | AmazonBedrockModelIds['anthropic']
  | (string & {});
