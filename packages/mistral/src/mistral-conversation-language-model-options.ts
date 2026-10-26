import { lazySchema, zodSchema } from '@ai-sdk/provider-utils';
import {
  mistralLanguageModelChatOptions,
  type MistralChatModelId,
  type MistralLanguageModelChatOptions,
} from './mistral-chat-language-model-options';

export type MistralConversationModelId = MistralChatModelId;

export const mistralLanguageModelConversationOptions = lazySchema(() =>
  zodSchema(mistralLanguageModelChatOptions()),
);

export type MistralLanguageModelConversationOptions =
  MistralLanguageModelChatOptions;
