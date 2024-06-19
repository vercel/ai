import {
  SystemContentBlock,
  ToolConfiguration,
} from '@aws-sdk/client-bedrock-runtime';

// https://docs.aws.amazon.com/bedrock/latest/userguide/model-ids.html
export type BedrockChatModelId =
  | 'amazon.titan-tg1-large'
  | 'amazon.titan-text-express-v1'
  | 'ai21.j2-grande-instruct'
  | 'ai21.j2-jumbo-instruct'
  | 'ai21.j2-mid'
  | 'ai21.j2-mid-v1'
  | 'ai21.j2-ultra'
  | 'ai21.j2-ultra-v1'
  | 'anthropic.claude-v2:1'
  | 'anthropic.claude-3-sonnet-20240229-v1:0'
  | 'anthropic.claude-3-haiku-20240307-v1:0'
  | 'anthropic.claude-3-opus-20240229-v1:0'
  | 'cohere.command-r-v1:0'
  | 'cohere.command-r-plus-v1:0'
  | 'meta.llama2-13b-chat-v1'
  | 'meta.llama2-70b-chat-v1'
  | 'meta.llama3-8b-instruct-v1:0'
  | 'meta.llama3-70b-instruct-v1:0'
  | 'mistral.mistral-7b-instruct-v0:2'
  | 'mistral.mixtral-8x7b-instruct-v0:1'
  | 'mistral.mistral-large-2402-v1:0'
  | 'mistral.mistral-small-2402-v1:0'
  | (string & {});

export interface BedrockChatSettings {
  /**
Additional inference parameters that the model supports,
beyond the base set of inference parameters that Converse
supports in the inferenceConfig field
*/
  additionalModelRequestFields?: Record<string, any>;
}
