import {
  OpenAIChatMessageGenerator,
  OpenAIChatMessageGeneratorSettings,
} from './openai-chat-message-generator';

export function chat(settings: OpenAIChatMessageGeneratorSettings) {
  return new OpenAIChatMessageGenerator(settings);
}
