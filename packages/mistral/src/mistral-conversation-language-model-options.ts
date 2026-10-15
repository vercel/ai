import {
  mistralLanguageModelChatOptions,
  type MistralChatModelId,
  type MistralLanguageModelChatOptions,
} from './mistral-chat-language-model-options';

export type MistralConversationModelId = MistralChatModelId;

export const mistralLanguageModelConversationOptions =
  mistralLanguageModelChatOptions;

export type MistralLanguageModelConversationOptions =
  MistralLanguageModelChatOptions;
