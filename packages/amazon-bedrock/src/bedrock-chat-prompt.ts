import { BedrockContentBlock } from './bedrock-api-types';

export type BedrockMessagesPrompt = {
  system?: string;
  messages: BedrockMessages;
};

export type BedrockMessages = Array<BedrockMessage>;

export type BedrockMessage = BedrockUserMessage | BedrockAssistantMessage;

export interface BedrockUserMessage {
  role: 'user';
  content: Array<BedrockContentBlock>;
}

export interface BedrockAssistantMessage {
  role: 'assistant';
  content: Array<BedrockContentBlock>;
}
