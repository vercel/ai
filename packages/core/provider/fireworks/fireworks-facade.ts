import {
  OpenAIChatLanguageModel,
  OpenAIChatLanguageModelSettings,
} from '../openai/openai-chat-language-model';

export function chat(settings: OpenAIChatLanguageModelSettings) {
  return new OpenAIChatLanguageModel({
    client: {
      apiKey: process.env.FIREWORKS_API_KEY!, // TODO lazy load & error message
      baseURL: 'https://api.fireworks.ai/inference/v1',
    },
    ...settings,
  });
}
