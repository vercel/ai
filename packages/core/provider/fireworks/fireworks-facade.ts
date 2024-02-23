import OpenAI from 'openai';
import {
  OpenAIChatLanguageModel,
  OpenAIChatMessageGeneratorSettings,
} from '../openai/openai-chat-language-model';

export function chat(settings: OpenAIChatMessageGeneratorSettings) {
  return new OpenAIChatLanguageModel({
    client: new OpenAI({
      apiKey: process.env.FIREWORKS_API_KEY,
      baseURL: 'https://api.fireworks.ai/inference/v1',
    }),
    ...settings,
  });
}
