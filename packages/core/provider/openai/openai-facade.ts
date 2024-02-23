import {
  OpenAIChatLanguageModel,
  OpenAIChatMessageGeneratorSettings,
} from './openai-chat-language-model';

export function chat(settings: OpenAIChatMessageGeneratorSettings) {
  return new OpenAIChatLanguageModel(settings);
}
