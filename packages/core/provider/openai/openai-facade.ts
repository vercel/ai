import {
  OpenAIChatLanguageModel,
  OpenAIChatLanguageModelSettings,
} from './openai-chat-language-model';

export function chat(settings: OpenAIChatLanguageModelSettings) {
  return new OpenAIChatLanguageModel(settings);
}
