import {
  MistralChatLanguageModel,
  MistralChatLanguageModelSettings,
} from './mistral-chat-language-model';

export function chat(settings: MistralChatLanguageModelSettings) {
  return new MistralChatLanguageModel(settings);
}
