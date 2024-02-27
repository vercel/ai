import OpenAI from 'openai';
import {
  OpenAIChatLanguageModel,
  OpenAIChatLanguageModelSettings,
} from '../openai/openai-chat-language-model';

export function chat(settings: OpenAIChatLanguageModelSettings) {
  return new OpenAIChatLanguageModel({
    client: new OpenAI({
      apiKey: process.env.PERPLEXITY_API_KEY,
      baseURL: 'https://api.perplexity.ai/',
    }),
    ...settings,
  });
}
