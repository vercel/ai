import type { AmazonBedrockModelIds } from '../amazon-bedrock-model-catalog';

export type BedrockMantleChatModelId =
  | AmazonBedrockModelIds['mantleChat']
  | (string & {});

export type BedrockMantleResponsesModelId =
  | AmazonBedrockModelIds['mantleResponses']
  | (string & {});

export type BedrockMantleModelId =
  | BedrockMantleChatModelId
  | BedrockMantleResponsesModelId;
