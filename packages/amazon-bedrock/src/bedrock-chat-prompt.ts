import { ContentBlock } from '@aws-sdk/client-bedrock-runtime';

export type BedrockMessagesPrompt = {
  system?: string;
  messages: BedrockMessages;
};

export type BedrockMessages = Array<ChatCompletionMessageParam>;

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
