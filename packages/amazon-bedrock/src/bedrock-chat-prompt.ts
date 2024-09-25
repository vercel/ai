import { ContentBlock } from '@aws-sdk/client-bedrock-runtime';

export type BedrockMessagesPrompt = {
  system?: string;
  messages: BedrockMessages;
};

export type BedrockMessages = Array<BedrockMessage>;

export type BedrockMessage = BedrockUserMessage | BedrockAssistantMessage;

export interface BedrockUserMessage {
  role: 'user';
  content: Array<ContentBlock>;
}

export interface BedrockAssistantMessage {
  role: 'assistant';
  content: Array<ContentBlock>;
}
