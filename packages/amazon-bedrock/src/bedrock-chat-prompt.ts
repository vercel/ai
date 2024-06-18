import { ContentBlock } from '@aws-sdk/client-bedrock-runtime';

export type BedrockChatPrompt = Array<ChatCompletionMessageParam>;

export type ChatCompletionMessageParam =
  | ChatCompletionUserMessageParam
  | ChatCompletionAssistantMessageParam;

export interface ChatCompletionUserMessageParam {
  role: 'user';
  content: Array<ContentBlock>;
}

export interface ChatCompletionAssistantMessageParam {
  role: 'assistant';
  content: Array<ContentBlock>;
}
